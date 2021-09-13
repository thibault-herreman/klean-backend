var app = require("../app");
var request = require("supertest");
const mongoose = require("mongoose");
const userModel = require("../models/users");
const cityModel = require("../models/cities");

beforeAll(async () => {
  const user = 'admin';
  const mdp = 'admin';
  const bddName = 'kleansBdd';

  const options = {
    connectTimeoutMS: 5000,
    useNewUrlParser: true,
    useUnifiedTopology : true
  }

  const connectionString =  `mongodb+srv://${user}:${mdp}@cluster0.wyxtx.mongodb.net/${bddName}?retryWrites=true&w=majority`;

  mongoose.connect(
      connectionString,
      options,        
      function(err) {
        if (!err) {
          console.log('Connection à la Base de données : ' + bddName + ' est OK');
        } else {
          console.log(err);
        }
        
      } 
  );
});

afterAll(async () => {
  await mongoose.connection.close();
});

// Vérification de l'existence d'un email en BDD   //
test("find user exist in bdd", async () => {
  const user = await userModel.findOne({email: "thomasmoreau11@gmail.com"})
  const { res } = await request(app).post("/users/sign-up").send({
    user,
  });
  expect(res).toBeTruthy();
}); // ---- > passed = email trouvé



describe("sign-up", () => {
  //    only one field input
  // test("only one field input", async () => {
  //   const { body } = await request(app).post("/users/sign-up").send({
  //     firstNameFromFront: "name",
  //   });
  //   expect(body).toStrictEqual({
  //     error: ["Veuillez remplir tous les champs.", "Format d'email incorrect"],
  //     result: false,
  //   });
  // });

  // //    all inputs empty
  test("all inputs empty", async () => {
    const { body } = await request(app).post("/users/sign-up").send({
      firstNameFromFront: "",
      lastNameFromFront: "",
      emailFromFront: "",
      cityFromFront: "",
      passwordFromFront: "",
    });
    expect(body).toStrictEqual({
      error: ["Veuillez remplir tous les champs.", "Format d'email incorrect"],
      result: false,
    });
  });
});


//   //    find user in DB
//     test("find user in DB", async () => {
//       const { body } = await request(app).post("/users/sign-up").send({
//         email: "test@gmail.com",
//       });
//       if (found) {
//         expect(body).toEqual({
//           city: found._id,
//         });
//       }
//       if (!found) {
//           expect(body).toEqual({
//           result: false,
//       });
//       }
//     });


//   //  find city in DB
//   test("find city in DB", async () => {
//     const found = await cityModel.findOne({ cityCode: 75056 });
//     const { body } = await request(app).post("/users/sign-up").send({

//       firstNameFromFront: "john",
//       lastNameFromFront: "doe",
//       emailFromFront: "blabla@gmail.com",
//       cityFromFront: "Paris",
//       passwordFromFront: "hello",
//       confirmPasswordFromFront: "hello",
//       cleanwalkIdFromFront: undefined,
//       found,
//     });
//     if (found) {
//       expect(body).toEqual({
//           result: false,
//         });
//         expect(body.result).toBeTruthy();
//     }
//     if (!found) {
//         expect(body.result).toBeFalsy();
//     }
//   });
// });

// describe("sign-in", () => {

//   // only one field input
//   test("only one field input", async () => {
//     const { body } = await request(app).post("/users/sign-up").send({
//       emailFromFront: "test@test.com",
//     });
//     expect.objectContaining({
//       error: ["Vous ne vous êtes pas encore enregistré."],
//       result: false,
//       user: null,
//       token: null,
//     });
//   });