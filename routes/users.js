var express = require("express");
var router = express.Router();

// models
const userModel = require("../models/users");
const cleanwalkModel = require("../models/cleanwalks");
const cityModel = require("../models/cities");

var bcrypt = require("bcrypt");
const uid2 = require("uid2");

// init cloudinary
var cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: "dcjawpw4p",
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRETKEY,
});

// regex pour l'email
function validateEmail(email) {
  const re =
    /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(email);
}

//    POST Sign-up    //
// requête à la BDD
// reçoit toutes les infos des champs 
// enregistre l'utilisateur en bdd
router.post("/sign-up", async function (req, res, next) {
  let error = [];
  let result = false;
  let saveUser = null;
  let token = null;
  let idCleanwalk = req.body.cleanwalkIdFromFront;
  let newParticipant = null;

  // vérification que l'utilisateur n'existe pas déjà
  let data = await userModel.findOne({
    email: req.body.emailFromFront,
  });

  // s'il existe on pousse dans le tableau error
  if (data != null) {
    error.push("Vous vous êtes déjà enregistré. Vous pouvez vous connecter.");
  }

  // si les champs sont vides on pousse dans le tableau error
  if (
    req.body.firsNameFromFront == "" ||
    req.body.lastNameFromFront == "" ||
    req.body.emailFromFront == "" ||
    req.body.cityFromFront == "" ||
    req.body.passwordFromFront == ""
  ) {
    error.push("Veuillez remplir tous les champs.");
  }

  // si l'email ne passe pas la regex on pousse dans le tableau error
  if (!validateEmail(req.body.emailFromFront)) {
    error.push("Format d'email incorrect");
  }

  // register si pas d'id de cleanwalk, on vient pas d'une preview
  if (error.length == 0 && idCleanwalk === undefined) {
    let cityInfo = JSON.parse(req.body.cityInfo);
    let code = cityInfo.properties.citycode;
    let coordinates = cityInfo.geometry.coordinates;
    let population = cityInfo.properties.population;
    let found = await cityModel.findOne({ cityCode: code });

    // si la ville existe on enregistre juste l'utilisateur
    if (found) {
      // cryptage du mot de passe
      let hash = bcrypt.hashSync(req.body.passwordFromFront, 10);
      let newUser = new userModel({
        firstName: req.body.firstNameFromFront,
        lastName: req.body.lastNameFromFront,
        email: req.body.emailFromFront.toLowerCase(),
        city: found._id,
        avatarUrl:
          "https://res.cloudinary.com/dcjawpw4p/image/upload/v1627998899/Klean/userblank_k9xp57.png",
        password: hash,
        token: uid2(32),
      });

      saveUser = await newUser.save();

      if (saveUser) {
        result = true;
        token = saveUser.token;
      }
    // si la ville n'existe pas on enregistre la ville puis l'utilisateur
    } else if (found == null) {
      let newCity = new cityModel({
        cityName: req.body.cityFromFront,
        cityCoordinates: {
          longitude: coordinates[0],
          latitude: coordinates[1],
        },
        population: population,
        cityCode: code,
      });
      let citySaved = await newCity.save();

      let hash = bcrypt.hashSync(req.body.passwordFromFront, 10);
      let newUser = new userModel({
        firstName: req.body.firstNameFromFront,
        lastName: req.body.lastNameFromFront,
        email: req.body.emailFromFront.toLowerCase(),
        city: citySaved._id,
        avatarUrl:
          "https://res.cloudinary.com/dcjawpw4p/image/upload/v1627998899/Klean/userblank_k9xp57.png",
        password: hash,
        token: uid2(32),
      });

      saveUser = await newUser.save();

      if (saveUser) {
        result = true;
        token = saveUser.token;
      }
    }

    res.json({
      error,
      result,
      saveUser,
      token,
    });
  }

  // register & participate, si il y a une id de cleanwalk : on vient d'une preview
  // on enregistre également l'id de l'utilisateur dans la tableau participantsList de la cleanwalk
  else if (error.length == 0 && idCleanwalk !== undefined) {
    let cityInfo = JSON.parse(req.body.cityInfo);
    let code = cityInfo.properties.citycode;
    let coordinates = cityInfo.geometry.coordinates;
    let population = cityInfo.properties.population;

    let found = await cityModel.findOne({ cityCode: code });

    if (found) {
      let hash = bcrypt.hashSync(req.body.passwordFromFront, 10);
      let newUser = new userModel({
        firstName: req.body.firstNameFromFront,
        lastName: req.body.lastNameFromFront,
        email: req.body.emailFromFront.toLowerCase(),
        city: found._id,
        avatarUrl:
          "https://res.cloudinary.com/dcjawpw4p/image/upload/v1627998899/Klean/userblank_k9xp57.png",
        password: hash,
        token: uid2(32),
      });

      let saveUser = await newUser.save();

      if (saveUser) {
        let cleanwalk = await cleanwalkModel.findOne({ _id: idCleanwalk });

        newParticipant = await cleanwalkModel.updateOne(
          { _id: idCleanwalk },
          { $push: { participantsList: saveUser._id } }
        );

        result = true;
        token = saveUser.token;
      }
    } else if (found == null) {
      let newCity = new cityModel({
        cityName: req.body.cityFromFront,
        cityCoordinates: {
          longitude: coordinates[0],
          latitude: coordinates[1],
        },
        population: population,
        cityCode: code,
      });
      let citySaved = await newCity.save();

      let hash = bcrypt.hashSync(req.body.passwordFromFront, 10);
      let newUser = new userModel({
        firstName: req.body.firstNameFromFront,
        lastName: req.body.lastNameFromFront,
        email: req.body.emailFromFront.toLowerCase(),
        city: citySaved._id,
        avatarUrl:
          "https://res.cloudinary.com/dcjawpw4p/image/upload/v1627998899/Klean/userblank_k9xp57.png",
        password: hash,
        token: uid2(32),
      });

      let saveUser = await newUser.save();

      if (saveUser) {
        let cleanwalk = await cleanwalkModel.findOne({ _id: idCleanwalk });

        newParticipant = await cleanwalkModel.updateOne(
          { _id: idCleanwalk },
          { $push: { participantsList: saveUser._id } }
        );

        result = true;
        token = saveUser.token;
      }
    }
    res.json({
      error,
      result,
      saveUser,
      token,
      newParticipant,
    });
  }
  else{
    res.json({ error, result });
  }
});

//    POST Sign-in    //
// requête à la BDD
// reçoit toutes les infos des champs 
// connecte l'utilisateur à l'appli
router.post("/sign-in", async function (req, res, next) {
  let error = [];
  let result = false;
  let user = null;
  let token = null;

  let idCleanwalk = req.body.cleanwalkIdFromFront;
  let newParticipant = null;

  // si les champs sont vides on pousse dans le tableau error
  if (req.body.emailFromFront == "" || req.body.passwordFromFront == "") {
    error.push("Veuillez remplir les deux champs.");
  }

  // sign-in
  // si pas d'id de cleanwalk, on vient pas d'une preview
  if (error.length == 0 && idCleanwalk === undefined) {
    // on regarde si l'email reçu existe
    user = await userModel.findOne({
      email: req.body.emailFromFront.toLowerCase(),
    });

    if (user) {
      // on compare le mot de passe reçu et celui en bdd
      if (bcrypt.compareSync(req.body.passwordFromFront, user.password)) {
        result = true;
        token = user.token;
      } else {
        result = false;
        error.push("Mot de passe incorrect.");
      }
    } else if (user == null) {
      error.push("Vous ne vous êtes pas encore enregistré.");
    }

    res.json({ error, result, user, token });
  }

  // sign-in & participate
  // si il y a une id de cleanwalk : on vient d'une preview
  // on enregistre également l'id de l'utilisateur dans la tableau participantsList de la cleanwalk
  else if (error.length == 0 && idCleanwalk !== undefined) {
    user = await userModel.findOne({
    email: req.body.emailFromFront.toLowerCase(),
    });

    if (user) {
      if (bcrypt.compareSync(req.body.passwordFromFront, user.password)) {
        result = true;
        token = user.token;

        let cleanwalk = await cleanwalkModel.findOne({ _id: idCleanwalk });

        newParticipant = await cleanwalkModel.updateOne(
          { _id: idCleanwalk },
          { $push: { participantsList: user._id } }
        );
      } else {
        result = false;
        error.push("Mot de passe incorrect.");
      }
    } else if (user == null){
      error.push("Vous ne vous êtes pas encore enregistré.");
    }
    res.json({ error, result, user, token, newParticipant });
  }
  else{
    res.json({ error, result });
  }
});


// PUT update password
// requête à la BDD
// reçoit l'ancien mot de passe, le nouveau et le token de l'utilisateur
// connecte l'utilisateur à l'appli
router.put("/update-password", async function (req, res, next) {
  let result = false;
  let newPassword = null;
  let error = [];
  let password = req.body.hold;
  let user = await userModel.findOne({ token: req.body.token });

  // si l'ancien mot de passe correspond à celui en bdd et si le nouveau est identique dans les 2 champs prévus
  // on crypte et on update le mot de passe
  if (bcrypt.compareSync(password, user.password) && req.body.new === req.body.confirmNewPass) {
    let hash = bcrypt.hashSync(req.body.confirmNewPass, 10);
    newPassword = await userModel.updateOne(
      { token: user.token },
      { password: hash }
    );
    if (newPassword != null) {
      result = true;
    }
    res.json({ result, user });

  } else if (req.body.new !== req.body.confirmNewPass) {
    error.push("Les champs du nouveau mot de passe ne sont pas identiques.");
    result = false,
    res.json({ result, error });
  }
  else {
    res.json({ result, error });
  }
});

module.exports = router;
