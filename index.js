const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorization access" });
  }
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCES_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Transaction,
} = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fluahev.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const userCollection = client.db("snapschool").collection("user");
    const classCollection = client.db("snapschool").collection("classes");
    const enrollCollection = client.db("snapschool").collection("enrolls");
    const paymentCollection = client.db("snapschool").collection("payments");

    // payment related apis
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { "payment.email": email };
      const result = await paymentCollection.find(filter).toArray();
      res.send(result);
    });

    // get payment by courseId ****
    app.get("/payments/:id", async (req, res) => {
      const id = req.query;
      console.log(id);
      const filter = { "payment.courseId": id };
      const result = await paymentCollection.find(filter).toArray();
      res.send(result);
    });

    // enroll related api

    app.post("/enroll", async (req, res) => {
      const item = req.body;
      const result = await enrollCollection.insertOne(item);
      res.send(result);
    });

    app.get("/enroll/:email", async (req, res) => {
      const email = req.params.email;

      const query = { email: email };
      const result = await enrollCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/enroll/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await enrollCollection.deleteOne(filter);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // class related api
    app.get("/class", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    app.get("/class/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { instructor_email: email };
      const result = await classCollection.find(filter).toArray();
      res.send(result);
    });

    app.post("/class", verifyJWT, async (req, res) => {
      const newClass = req.body;
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.put("/class/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;

      const updateClass = {
        $set: {
          name: data.name,
          available_seat: data.available_seat,
          price: data.price,
        },
      };
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };

      const result = await classCollection.updateOne(
        filter,
        updateClass,
        options
      );
      res.send(result);
    });

    // app.put("/courseEnrolled", async (req, res) => {
    //   const id = req.query.id;
    //   const filter = { _id: new ObjectId(id) };
    //   const course = await classCollection.findOne(filter);
    //   console.log(course);
    //   const updateCourseEnrolled = {
    //     $set: {
    //       total_enrolled: course.total_enrolled++,
    //     },
    //   };
    //   const options = { upsert: true };
    //   const result = await classCollection.updateOne(
    //     filter,
    //     updateCourseEnrolled,
    //     options
    //   );
    //   res.send(result);
    // });

    app.put("/class/status/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateStatus = {
        $set: {
          status: data.status,
        },
      };
      const options = { upsert: true };
      const result = await classCollection.updateOne(
        filter,
        updateStatus,
        options
      );
      res.send(result);
    });

    // class feedback related api
    app.put("/class/feedback/:id", async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateFeedback = {
        $set: {
          feedback: data.feedback,
        },
      };
      const options = { upsert: true };
      const result = await classCollection.updateOne(
        filter,
        updateFeedback,
        options
      );
      res.send(result);
    });

    // JWT RELATED APIS
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCES_TOKEN_SECRET, {
        expiresIn: "6hr",
      });
      res.send({ token });
    });

    // varify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // varify instructor ***
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    // user related api

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/instructor", async (req, res) => {
      const filter = { role: "instructor" };
      const result = await userCollection.find(filter).toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const existingUser = await userCollection.findOne(filter);
      if (existingUser) {
        return res.send({ message: "user already existed" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // cheaking admin or not

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    // cheaking instructor or not ***

    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(filter);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("snapschool is running");
});

app.listen(port, () => {
  console.log(`snapschool is running on port ${port}`);
});
