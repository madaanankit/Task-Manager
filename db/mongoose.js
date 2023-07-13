// This file will handle the connection to mongodb database
const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
mongoose
  .connect("mongodb://127.0.0.1:27017/TaskManager", { useNewUrlParser: true })
  .then(() => {
    console.log("Connected to db");
  })
  .catch((e) => {
    console.log("Error connecting to db");
    console.log(e);
  });

// The below commands are used to avoid deprecation warnings
// mongoose.set("useCreateIndex", true);
// mongoose.set("useFindAndModify", false);

module.exports = {
  mongoose,
};
