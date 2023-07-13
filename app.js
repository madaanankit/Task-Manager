const express = require("express");
const app = express();

const { mongoose } = require("./db/mongoose");

const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");

app.use(bodyParser.json());

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id"
  );

  res.header(
    "Access-Control-Expose-Headers",
    "x-access-token, x-refresh-token"
  );

  next();
});

let authenticate = (req, res, next) => {
  let token = req.header("x-access-token");
  jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
    if (err) res.status(401).send(err);
    req.user_id = decoded._id;
    next();
  });
};

let verifySession = (req, res, next) => {
  let refreshToken = req.header("x-refresh-token");
  let _id = req.header("_id");
  User.findByIdAndToken(_id, refreshToken)
    .then((user) => {
      if (!user) {
        return Promise.reject({ error: "user not found" });
      }
      req.user_id = user._id;
      req.userObject = user;
      req.refreshToken = refreshToken;
      let isSessionValid = false;
      user.sessions.forEach((session) => {
        if (session.token === refreshToken) {
          if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
            isSessionValid = true;
          }
        }
      });
      if (isSessionValid) {
        next();
      } else {
        return Promise.reject({ error: "Refresh token expired" });
      }
    })
    .catch((err) => {
      res.status(401).send(err);
    });
};

// Loading mongoose models

const { List, Task, User } = require("./db/models");
// Route Handlers

// Getting the list
app.get("/lists", authenticate, (req, res) => {
  // return an array of lists in db
  List.find({
    _userId: req.user_id,
  }).then((list) => {
    res.send(list);
  });
});

// Adding a new list
app.post("/lists", authenticate, (req, res) => {
  // Create a new list and return updated list
  let title = req.body.title;
  let newList = new List({
    title,
    _userId: req.user_id,
  });
  newList.save().then((listDoc) => {
    res.send(listDoc);
  });
});

// Update a list
app.patch("/lists/:id", authenticate, (req, res) => {
  // update the list with new values
  try {
    List.findOneAndUpdate(
      { _id: req.params.id, _userId: req.user_id },
      { $set: req.body }
    ).then(() => {
      res.send({ message: "updated successfully" });
    });
  } catch (e) {
    print(e);
  }
});

app.delete("/lists/:id", authenticate, (req, res) => {
  // delete the list
  List.findOneAndRemove({
    _id: req.params.id,
    _userId: req.user_id,
  }).then((removedListDoc) => {
    res.send(removedListDoc);
    deleteTaskFromList(removedListDoc._id);
  });
});

app.get("/lists/:listId/tasks", authenticate, (req, res) => {
  Task.find({
    _listId: req.params.listId,
  }).then((tasks) => {
    res.send(tasks);
  });
});

app.post("/lists/:listId/tasks", authenticate, (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id,
  })
    .then((list) => {
      if (list) {
        return true;
      }
      return false;
    })
    .then((canCreateTask) => {
      if (canCreateTask) {
        let newTask = new Task({
          title: req.body.title,
          _listId: req.params.listId,
        });
        newTask.save().then((newTaskDoc) => {
          res.send(newTaskDoc);
        });
      } else {
        res.sendStatus(404);
      }
    });
});

app.patch("/lists/:listId/tasks/:taskId", authenticate, (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id,
  })
    .then((list) => {
      if (list) {
        return true;
      }
      return false;
    })
    .then((canUpdate) => {
      if (canUpdate) {
        Task.findOneAndUpdate(
          {
            _id: req.params.taskId,
            _listId: req.params.listId,
          },
          {
            $set: req.body,
          }
        ).then(() => {
          res.send({ message: "Updated Successfully" });
        });
      } else {
        res.sendStatus(404);
      }
    });
});

app.delete("/remove-account", authenticate, async (req, res) => {
  // get all lists associated with the account and then remove tasks from each list and then remove the account from user table
  const allList = await List.find({
    _userId: req.user_id,
  });
  for (let i = 0; i < allList.length; i++) {
    await deleteTaskFromList(allList[i]._id);
  }

  await deleteAllList(req.user_id);

  User.findOneAndRemove({
    _id: req.user_id,
  }).then((removedDoc) => {
    res.send(removedDoc);
  });
});

app.delete("/lists/:listId/tasks/:taskId", authenticate, (req, res) => {
  List.findOne({
    _id: req.params.listId,
    _userId: req.user_id,
  })
    .then((list) => {
      if (list) {
        return true;
      }
      return false;
    })
    .then((canDelete) => {
      if (canDelete) {
        Task.findOneAndRemove({
          _listId: req.params.listId,
          _id: req.params.taskId,
        }).then((removedTaskDoc) => {
          res.send(removedTaskDoc);
        });
      } else {
        res.sendStatus(404);
      }
    });
});

// app.get("/lists/:listId/tasks/:taskId", (req, res) => {
//   Task.findOne({
//     _id: req.params.taskId,
//     _listId: req.params.listId,
//   }).then((task) => {
//     res.send(task);
//   });
// });

// User Routes
// signup
app.post("/users", (req, res) => {
  let body = req.body;
  let newUser = new User(body);

  newUser.save().then(() => {
    return newUser
      .createSession()
      .then((refreshToken) => {
        return newUser.generateAccessAuthToken().then((accessToken) => {
          return { accessToken, refreshToken };
        });
      })
      .then((authTokens) => {
        res
          .header("x-refresh-token", authTokens.refreshToken)
          .header("x-access-token", authTokens.accessToken)
          .send(newUser);
      })
      .catch((e) => {
        res.status(400).send(e);
      });
  });
});

// login
app.post("/users/login", (req, res) => {
  let email = req.body.email;
  let password = req.body.password;

  User.findByCredentials(email, password)
    .then((user) => {
      return user
        .createSession()
        .then((refreshToken) => {
          return user.generateAccessAuthToken().then((accessToken) => {
            return { accessToken, refreshToken };
          });
        })
        .then((authTokens) => {
          res
            .header("x-refresh-token", authTokens.refreshToken)
            .header("x-access-token", authTokens.accessToken)
            .send(user);
        });
    })
    .catch((e) => {
      res.status(400).send(e);
    });
});

app.get("/users/me/access-token", verifySession, (req, res) => {
  req.userObject
    .generateAccessAuthToken()
    .then((accessToken) => {
      res.header("x-access-token", accessToken).send({ accessToken });
    })
    .catch((error) => {
      res.status(400).send(error);
    });
});

let deleteTaskFromList = async (_listId) => {
  await Task.deleteMany({
    _listId,
  }).then(() => {
    console.log("Task deleted" + _listId);
  });
};

let deleteAllList = async (_userId) => {
  await List.deleteMany({
    _userId,
  });
  console.log("List deleted");
};

app.listen(3000, () => {
  console.log("listening on port 3000");
});
