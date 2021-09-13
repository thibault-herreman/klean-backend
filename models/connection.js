var mongoose = require('mongoose');

const bddName = 'kleansBdd';

const options = {
  connectTimeoutMS: 5000,
  useNewUrlParser: true,
  useUnifiedTopology : true
}

mongoose.connect(
    process.env.CONNECTIONSTRING,
    options,        
    function(err) {
      if (!err) {
        console.log(`Connection à la Base de données : ${bddName} est OK`);
      } else {
        console.log(err);
      }
      
    } 
);

module.exports = mongoose