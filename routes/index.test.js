var app = require("../app");
var request = require("supertest");

const userModel = require("../models/users");

describe("autocomplete-search", () => {

    test("find user in DB with token", async () => {
        
        const { body } = await request(app).post("/autocomplete-search").send({
            lastName: 'Dubois'
        });

        const user = await userModel.findOne({ token: 'oUAXdCZJ6qboclwvwyDQPgcxEAyO2e0K' });

        expect(user.lastName).toBeTruthy();

    });

});