var express = require("express");
var router = express.Router();
var uniqid = require('uniqid');
var fs = require('fs');
var request = require("sync-request");

// models
const cityModel = require("../models/cities");
const cleanwalkModel = require("../models/cleanwalks");
const userModel = require("../models/users");

// init cloudinary
var cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: "dcjawpw4p",
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRETKEY,
});

// fonction validation token
async function tokenIsValidated(token) {
  let userRequest = await userModel.find()
  let userTokenArr = userRequest.map(obj => obj.token)

  // j'ajoute le token invité
  userTokenArr.push(process.env.TOKENINVITE)

  // on regarde si le token reçu en paramètre existe
  if (userTokenArr.every(str => str !== token)) {
    return false
  } else {
    return true
  }
}


/*AUTOCOMPLETE-SEARCH*/
// appel à l'API api-adresse.data.gouv.fr/search/
// reçoit une adresse formatée, renvoie une liste de villes/adresses avec les infos nécessaires
router.post("/autocomplete-search", async function (req, res, next) {
  if (await tokenIsValidated(req.body.token)) {
    let requete = request(
      "GET",
      `https://api-adresse.data.gouv.fr/search/?q=${req.body.adress}`
    );
    let response = JSON.parse(requete.body);

    res.json({ result: true, response: response.features });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*AUTOCOMPLETE-SEARCH-CITY-ONLY*/
// appel à l'API api-adresse.data.gouv.fr/search/
// reçoit une ville, renvoie une liste de villes avec les infos nécessaires
router.post("/autocomplete-search-city-only", async function (req, res, next) {

  if (await tokenIsValidated(req.body.token)) {
    let cityRegex = /arrondissement/i;
    let requete = request(
      "GET",
      `https://api-adresse.data.gouv.fr/search/?q=${req.body.city}&type=municipality`
    );
    let response = JSON.parse(requete.body);
    let newResponse = response.features.filter(
      (obj) => !cityRegex.test(obj.properties.label)
    );
    newResponse = newResponse.map((obj) => {
      let copy = { ...obj };
      copy.properties.label = copy.properties.city;
      return copy;
    });

    res.json({ result: true, newResponse });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*LOAD-CLEANWALK*/
// requête à la BDD
// reçoit un id de cleanwalk, renvoie toutes les infos de la cleanwalk en faisant des populate pour charger les clés étrangères
router.get("/load-cleanwalk/:idCW/:token", async function (req, res, next) {
  if (await tokenIsValidated(req.params.token)) {
    var cleanwalk = await cleanwalkModel
      .findById(req.params.idCW)
      .populate("cleanwalkCity")
      .populate("participantsList")
      .populate("admin")
      .exec();

    res.json({ result: true, cleanwalk });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*LOAD-PIN-ON-CHANGE-REGION*/
// requête à la BDD
// reçoit des coordonnées et une date, renvoie un tableau d'objet de cleanwalk correspondant au périmètre des coordonnées
router.post("/load-pin-on-change-region", async function (req, res, next) {

  if (await tokenIsValidated(req.body.token)) {

    const coordinateJsonParse = JSON.parse(req.body.coordinate);
    const dateSearch = req.body.date;

    //on définit la fonction pour calculer les intervales nécessaires à la requête
    const definePerimeter = (regionLat, regionLong, latD, longD) => {
      let interval = {
        lat: { min: regionLat - 0.5 * latD, max: regionLat + 0.5 * latD },
        long: { min: regionLong - 0.5 * longD, max: regionLong + 0.5 * longD },
      };
      return interval;
    };

    //on reçoit via le body les éléments de la région qu'on place en arguments de la fonction
    let customInterval = definePerimeter(
      coordinateJsonParse.latitude,
      coordinateJsonParse.longitude,
      coordinateJsonParse.latitudeDelta,
      coordinateJsonParse.longitudeDelta
    );

    //on fait la requete dans MongoDB
    let cleanWalkRequest = await cleanwalkModel
      .find()
      .where("cleanwalkCoordinates.latitude")
      .gte(customInterval.lat.min)
      .lte(customInterval.lat.max)
      .where("cleanwalkCoordinates.longitude")
      .gte(customInterval.long.min)
      .lte(customInterval.long.max)
      .where("startingDate")
      .gte(dateSearch)
      .populate("admin")
      .exec();

    res.json({ result: true, cleanWalkArray: cleanWalkRequest });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*LOAD-CITIES-RANKING*/
// requête à la BDD
// on fait une aggregation pour ressortir le nombre de cleanwalk par ville
// on attribut à la ville 5 points par cleanwalk réalisée
router.get("/load-cities-ranking", async function (req, res, next) {
  let pointsPerCw = 5;

  let cwpercity = await cleanwalkModel.aggregate([
    { $group: { _id: "$cleanwalkCity", count: { $sum: pointsPerCw } } },
    { $sort: { count: -1 } },
    {
      $lookup: {
        from: "cities",
        localField: "_id",
        foreignField: "_id",
        as: "city_info",
      },
    },
  ]);


  //ajout des villes sans CW (0 points)
  let cityArr = await cityModel.find()

  for (let i = 0; i < cityArr.length; i++) {
    if (cwpercity.some(obj => obj["_id"].toString() === cityArr[i]["_id"].toString())) {
    } else {
      cwpercity.push({ _id: cityArr[i]["_id"], count: 0, city_info: [cityArr[i]] })
    }

  }

  let token = req.query.token;
  let user = await userModel.find({ token: token });

  if (user.length > 0) {

    // on regarde si c'est la ville de l'utilisateur
    cwpercity = cwpercity.map((obj, i) => {
      let copy = {};
      if (obj["_id"].toString() === user[0].city.toString()) {
        copy.isMyCity = true;
      } else {
        copy.isMyCity = false;
      }
      copy.city = obj["city_info"][0].cityName;
      copy.points = obj.count;
      copy.ranking = i + 1;
      return copy;
    });

    res.json({ result: true, ranking: cwpercity });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

/*LOAD-PROFIL*/
// requête à la BDD
// reçoit le token, renvoie toutes les infos nécéssaires : 
// les cleanwalks où l'utilisateur participe triés avec la startingDate
// les cleanwalks qu'organise l'utilisateur triés avec la startingDate
// les infos, les stats de l'utilisateur et celles de sa ville
router.get("/load-profil/:token", async function (req, res, next) {
  const token = req.params.token;
  const date = new Date();
  const user = await userModel.findOne({ token: token });

  if (user) {
    const userId = user._id;

    // unwind éclate le tableau 'participantsList' dans l'objet cleanwalk, il fait autant d'objet qu'il y a d'élément dans le tableau
    // cela devient une clé 'participantsList' de l'objet cleanwalk
    // on fait ensuite un match pour ne garder que ceux qui ont comme valeur l'id de l'user
    // puis on fait un match avec la date du jour avec une query pour afficher que celles qui ne sont pas dépassées
    const cleanwalksParticipate = await cleanwalkModel.aggregate([
      { $unwind: "$participantsList" },
      { $match: { participantsList: userId } },
      { $match: { startingDate: { $gte: date } } },
    ]);

    // Création du tableau d'objets des CW auquelles ils participent avec uniquement les infos qu'on a besoin
    const infosCWparticipate = cleanwalksParticipate.map((cleanwalk) => {
      return {
        id: cleanwalk._id,
        title: cleanwalk.cleanwalkTitle,
        date: cleanwalk.startingDate,
      };
    });

    // récup des cleanwalks qu'organise le user
    const cleanwalksOrganize = await cleanwalkModel.find({
      admin: userId,
      startingDate: { $gte: date },
    });

    // Création du tableau d'objets des CW qu'ils organisent avec uniquement les infos qu'on a besoin
    const infosCWorganize = cleanwalksOrganize.map((cleanwalk) => {
      return {
        id: cleanwalk._id,
        title: cleanwalk.cleanwalkTitle,
        date: cleanwalk.startingDate,
      };
    });

    // création d'un objet avec uniquement les infos du user qu'on veut afficher ds le screen profil
    const infosUser = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl,
    };

    //Statistiques personnelles
    let ArrStatPerso = infosCWorganize.concat(infosCWparticipate);

    //statistiques de ma ville
    let pointsPerCw = 5;

    let cwpercity = await cleanwalkModel.aggregate([
      { $group: { _id: "$cleanwalkCity", points: { $sum: pointsPerCw } } },
      { $sort: { count: -1 } },
      {
        $lookup: {
          from: "cities",
          localField: "_id",
          foreignField: "_id",
          as: "city_info",
        },
      },
      { $match: { _id: user.city } },
    ]);

    //s'il n'y a pas encore de CW organisées dans la ville, pour remonter ses stats à 0
    if (cwpercity.length === 0) {
      userCity = await cityModel.findById(user.city)
      cwpercity = [{
        _id: user.city,
        points: 0,
        city_info: [userCity]
      }]
    }

    res.json({
      result: true,
      infosCWparticipate,
      infosCWorganize,
      infosUser,
      statPerso: ArrStatPerso.length,
      statCity: cwpercity[0],
    });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

/* unsubscribe to cleanwalk */
// requête à la BDD
// reçoit un id de cleanwalks et le token de l'utilisateur, 
// fait une requête pour supprimer l'id user du tableau participantsList de la cleanwalk
router.post("/unsubscribe-cw", async function (req, res, next) {

  const token = req.body.token;
  const idCW = req.body.idCW;
  const user = await userModel.findOne({ token: token });

  if (user) {

    await cleanwalkModel.updateOne(
      { _id: idCW },
      { $pull: { participantsList: user._id } }
    );

    res.json({ result: true });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

/* delete to cleanwalk */
// requête à la BDD
// reçoit un id de cleanwalks et le token de l'utilisateur, 
// fait une requête pour supprimer la cleanwalk de la bdd
router.delete("/delete-cw/:token/:idCW", async function (req, res, next) {

  const token = req.params.token;
  const idCW = req.params.idCW;

  const user = await userModel.findOne({ token: token });

  if (user) {

    await cleanwalkModel.deleteOne(
      { _id: idCW }
    );

    res.json({ result: true });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

/*LOAD MESSAGE*/
// requête à la BDD
// reçoit un id de cleanwalks et le token de l'utilisateur, 
// fait une requête pour charger les messages de la cleanwalk
router.get("/load-messages/:token/:cwid", async function (req, res, next) {

  if (await tokenIsValidated(req.params.token)) {

    let cleanwalk = await cleanwalkModel.find({ _id: req.params.cwid });
    let messages = cleanwalk[0].messages;

    res.json({ result: true, messages });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*SAVE-MESSAGE*/
// requête à la BDD
// reçoit un id de cleanwalks, un message, une date et le token de l'utilisateur, 
// fait une requête pour enregistrer le message dans le tableau messages de la cleanwalk
router.post("/save-message", async function (req, res, next) {

  if (await tokenIsValidated(req.body.token)) {

    let token = req.body.token;
    let cwid = req.body.cwid;
    let message = JSON.parse(req.body.message);
    let date = JSON.parse(req.body.date);

    let cleanwalk = await cleanwalkModel.find({ _id: cwid });
    let user = await userModel.find({ token: token });
    let sender = user[0].firstName;

    cleanwalk[0].messages.push({
      user: sender,
      message: message,
      date: date,
    });

    let cleanwalkSaved = await cleanwalk[0].save();

    if (cleanwalkSaved) {
      res.json({ result: true, messages: cleanwalkSaved.messages });
    } else {
      res.json({ result: true, error: "Couldn't save the message" });
    }
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

/*CREATE-CW*/
// requête à la BDD
// reçoit toutes les infos nécéssaires pour créer une cleanwalk, 
// fait une requête pour enregistrer la cleanwalk dans la bdd
router.post("/create-cw", async function (req, res, next) {
  let error = [];
  var result = false;
  let resultSaveCleanwalk = false;
  let resultSaveCity = false;


  let cityInfo = JSON.parse(req.body.city);

  let code = cityInfo.cityCode;
  let userToken = req.body.token;
  if (
    req.body.title == "" ||
    req.body.description == "" ||
    req.body.startingDate == "" ||
    req.body.endingDate == "" ||
    req.body.tool == ""
  ) {
    error.push("Tous les champs sont obligatoires. Veuillez les remplir.");
  }

  let user = await userModel.findOne({ token: userToken });
  let found = await cityModel.findOne({ cityCode: code });

  // si la ville existe déjà
  if (error.length == 0 && found) {
    let splitedTool = req.body.tool.split(",");
    splitedTool = splitedTool.map(str => str.replace(/ /g, "").replace(/\n/g, ""));

    var addCW = new cleanwalkModel({
      cleanwalkTitle: req.body.title,
      cleanwalkDescription: req.body.description,
      cleanwalkCity: found._id,
      cleanwalkCoordinates: {
        longitude: cityInfo.cleanwalkCoordinates.lon,
        latitude: cityInfo.cleanwalkCoordinates.lat,
      },
      startingDate: req.body.startingDate,
      endingDate: req.body.endingDate,
      toolBadge: splitedTool,
      admin: user._id,
    });

    var cleanwalkSave = await addCW.save();

    resultSaveCleanwalk = true;
    result = true;

    res.json({ result, error, resultSaveCleanwalk, cleanwalkSave });
  }

  // si la ville n'existe pas on l'enregistre avant d'enregister également la cleanwalk
  else if (error.length == 0 && found == null) {
    let newCity = cityModel({
      cityName: cityInfo.cityName,
      cityCoordinates: {
        longitude: cityInfo.cityCoordinates[0],
        longitude: cityInfo.cityCoordinates[1],
      },
      population: cityInfo.cityPopulation,
      cityCode: cityInfo.cityCode,
    });

    let citySaved = await newCity.save();

    if (citySaved) {
      let splitedTool = req.body.tool.split(",");
      splitedTool = splitedTool.map(str => str.replace(/ /g, "").replace(/\n/g, ""));

      var addCW = new cleanwalkModel({
        cleanwalkTitle: req.body.title,
        cleanwalkDescription: req.body.description,
        cleanwalkCity: citySaved._id,
        cleanwalkCoordinates: {
          longitude: cityInfo.cityCoordinates[0],
          latitude: cityInfo.cityCoordinates[1],
        },
        startingDate: req.body.startingDate,
        endingDate: req.body.endingDate,
        toolBadge: splitedTool,
        admin: user._id,
      });

      var cleanwalkSave = await addCW.save();
    }

    resultSaveCleanwalk = true;
    resultSaveCity = true;
    result = true;

    res.json({
      result,
      error,
      resultSaveCleanwalk,
      resultSaveCity,
      cleanwalkSave
    });
  }
});


// subscribe to cleanwalk
// requête à la BDD
// reçoit un id de cleanwalks et le token de l'utilisateur, 
// fait une requête pour ajouter l'id user du tableau participantsList de la cleanwalk
router.post("/subscribe-cw", async function (req, res, next) {
  let error = [];
  let user = await userModel.findOne({ token: req.body.token });

  newParticipant = await cleanwalkModel.updateOne(
    { _id: req.body.cleanwalkID },
    { $push: { participantsList: user._id } }
  );

  if (newParticipant.n == 1) {
    res.json({ result: true });
  } else {
    error.push("Erreur, veuillez réessayer.")
    res.json({ result: false, error });
  }
});

/*GET-CITY-FROM-COORDINATES --> proposer une cleanwalk*/
// appel à l'API api-adresse.data.gouv.fr/reverse/
// reçoit des coordonnées, 
// revoie un nom de ville
router.post("/get-city-from-coordinates", async function (req, res, next) {

  if (await tokenIsValidated(req.body.token)) {

    let requete = request(
      "GET",
      `https://api-adresse.data.gouv.fr/reverse/?lon=${req.body.lonFromFront}&lat=${req.body.latFromFront}`
    );
    let response = JSON.parse(requete.body);

    res.json({ result: true, response: response });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*SEARCH-CITY-ONLY*/
// appel à l'API api-adresse.data.gouv.fr/search/
// reçoit une nom de ville, 
// revoie un nom de ville précis, sans l'éventuel arrondissement
router.post("/search-city-only", async function (req, res, next) {

  if (await tokenIsValidated(req.body.token)) {

    let cityRegex = /arrondissement/i;
    let requete = request(
      "GET",
      `https://api-adresse.data.gouv.fr/search/?q=${req.body.city}&type=municipality`
    );
    let response = JSON.parse(requete.body);
    let newResponse = response.features.filter(
      (obj) => !cityRegex.test(obj.properties.label)
    );
    newResponse = newResponse.map((obj) => {
      let copy = { ...obj };
      copy.properties.label = copy.properties.city;
      return copy;
    });

    res.json({ result: true, newResponse });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});


/*LOAD-CW-FORSTORE*/
// requête à la BDD
// reçoit le token, renvoie toutes les infos nécéssaires : 
// les cleanwalks où l'utilisateur participe
// les cleanwalks qu'organise l'utilisateur
// triés avec la startingDate
router.get("/load-cw-forstore/:token", async function (req, res, next) {
  const token = req.params.token;
  const date = new Date();
  const user = await userModel.findOne({ token: token });

  if (user) {
    const userId = user._id;

    // unwind éclate le tableau 'participantsList' dans l'objet cleanwalk, il fait autant d'objet qu'il y a d'élément dans le tableau
    // cela devient une clé 'participantsList' de l'objet cleanwalk
    // on fait ensuite un match pour ne garder que ceux qui ont comme valeur l'id de l'user
    // puis on fait un match avec la date du jour avec une query pour afficher que celles qui ne sont pas dépassées
    const cleanwalksParticipate = await cleanwalkModel.aggregate([
      { $unwind: "$participantsList" },
      { $match: { participantsList: userId } },
      { $match: { startingDate: { $gte: date } } },
    ]);

    // Création du tableau des CW auquelles ils participent avec uniquement les ids des CW
    const infosCWparticipate = cleanwalksParticipate.map((cleanwalk) => {
      return cleanwalk._id;
    });

    // récup des cleanwalks qu'organise le user
    const cleanwalksOrganize = await cleanwalkModel.find({
      admin: userId,
      startingDate: { $gte: date },
    });

    // Création du tableau des CW qu'ils organisent avec uniquement les ids des CW
    const infosCWorganize = cleanwalksOrganize.map((cleanwalk) => {
      return cleanwalk._id;
    });

    res.json({ result: true, infosCWparticipate, infosCWorganize });
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

//UPLOAD-PHOTO
// requête à la BDD
// reçoit le token et une image sous forme Data,
// enregistre l'image dans Cloudinary et l'url en bdd
router.post("/upload-photo/:token", async function (req, res, next) {

  if (await tokenIsValidated(req.params.token)) {
    let result = true;
    let error = [];
    let resultCloudinary;
    let pictureName = './tmp/' + uniqid() + '.jpg';
    let resultCopy = await req.files.avatar.mv(pictureName);

    if (!resultCopy) {
      resultCloudinary = await cloudinary.uploader.upload(pictureName,
        { public_id: "Klean/" + uniqid() },
        function (error, result) { console.log(result, error); });

      if (resultCloudinary) {
        let user = await userModel.findOne({ token: req.params.token })
        user.avatarUrl = resultCloudinary.secure_url
        userSaved = await user.save()
        if (!userSaved) {
          result = false
          error.push('Failed to save user in DB')
        }
      } else {
        result = false
        error.push('failed to save picture in cloud')
      }

    } else {
      result = false
      error.push('failed to upload file in backend')
    }

    res.json({ result, resultCloudinary, resultCopy, error });
    fs.unlinkSync(pictureName);
    
  } else {
    res.json({ result: false, error: "user not found" });
  }
});

module.exports = router;