const fs = require("fs"); //we need this to read our keys. Part of node

//in production, we will use https
const https = require("https"); //we need this for a secure express server. part of node
const http = require("http");
//express sets up the http server and serves our front end
const express = require("express");
const app = express();
const path = require("path");
const WebSocket = require("ws"); // Add WebSocket for transcription
const config = require("./config/config");
//seve everything in public statically
app.use(express.static("public"));

//in production, we will use the keys in the meetings-certs folder
// const key = fs.readFileSync("../meetings-certs/privkey.pem");
// const cert = fs.readFileSync("../meetings-certs/fullchain.pem");

// in development, we will use the keys in the config folder
// const key = fs.readFileSync("./config/create-cert-key.pem");
// const cert = fs.readFileSync("./config/create-cert.pem");

// const options = { key, cert };

//use those keys with the https module to have https
// const httpsServer = https.createServer(options, app)

// Add CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

let server;
if (config.currentEnv.useHttps) {
  // Production HTTPS setup
  const key = fs.readFileSync(config.currentEnv.keyPath);
  const cert = fs.readFileSync(config.currentEnv.certPath);
  const options = { key, cert };
  server = https.createServer(options, app);
} else {
  // Development HTTP setup
  server = http.createServer(app);
}

const socketio = require("socket.io");
const mediasoup = require("mediasoup");

const createWorkers = require("./utilities/createWorkers");
const getWorker = require("./utilities/getWorker");
const updateActiveSpeakers = require("./utilities/updateActiveSpeakers");
const Client = require("./classes/Client");
const Room = require("./classes/Room");

//set up the socketio server, listening by way of our express https sever
// const io = socketio(httpsServer,{
const io = socketio(server, {
  cors: [
    `https://localhost:5173`,
    `http://localhost:5173`,
    `https://192.168.1.44:3004`,
    `https://154.53.42.27:3004`,
    `http://154.53.42.27:3004`,
    `https://meetings.aiiventure.com`,
  ],
  transports: ["websocket", "polling"],
});

//our globals
//init workers, it's where our mediasoup workers will live
let workers = null;
// router is now managed by the Room object
// master rooms array that contains all our Room object
const rooms = [];

//initMediaSoup gets mediasoup ready to do its thing
const initMediaSoup = async () => {
  workers = await createWorkers();
  // console.log(workers)
};

initMediaSoup(); //build our mediasoup server/sfu

// socketIo listeners
io.on("connect", (socket) => {
  // this is where this client/user/socket lives!
  let client; //this client object available to all our socket listeners
  const handshake = socket.handshake; //socket.handshake is where auth and query live
  //you could now check handshake for password, auth, etc.

  // Add chat message handling
  socket.on("sendChatMessage", (message) => {
    if (!client || !client.room) {
      return;
    }

    const chatMessage = {
      id: Date.now(), // Unique ID for the message
      text: message,
      sender: client.userName,
      senderRole: client.userRole,
      timestamp: new Date().toISOString(),
      socketId: socket.id, // Include socket ID to identify the sender
    };

    // Add message to room history
    client.room.addChatMessage(chatMessage);

    // Broadcast to all users in the room
    io.to(client.room.roomName).emit("chatMessage", chatMessage);
  });

  socket.on("getChatHistory", (data, ackCb) => {
    if (!client || !client.room) {
      if (typeof ackCb === "function") {
        ackCb([]);
      }
      return;
    }

    // Return chat history to requesting client
    if (typeof ackCb === "function") {
      ackCb(client.room.getChatHistory());
    }
  });

  socket.on("joinRoom", async ({ userName, roomName, userRole = "candidate" }, ackCb) => {
    let newRoom = false;
    client = new Client(userName, socket, userRole);
    let requestedRoom = rooms.find((room) => room.roomName === roomName);
    if (!requestedRoom) {
      newRoom = true;
      // make the new room, add a worker, add a router
      const workerToUse = await getWorker(workers);
      requestedRoom = new Room(roomName, workerToUse);
      await requestedRoom.createRouter(io);
      rooms.push(requestedRoom);
    }
    // add the room to the client
    client.room = requestedRoom;
    // add the client to the Room clients
    client.room.addClient(client);
    // add this socket to the socket room
    socket.join(client.room.roomName);

    //fetch the first 0-5 pids in activeSpeakerList
    const audioPidsToCreate = client.room.activeSpeakerList.slice(0, 5);
    //find the videoPids and make an array with matching indicies
    // for our audioPids.
    const videoPidsToCreate = audioPidsToCreate.map((aid) => {
      const producingClient = client.room.clients.find((c) => c?.producer?.audio?.id === aid);
      return producingClient?.producer?.video?.id;
    });
    //find the username and make an array with matching indicies
    // for our audioPids/videoPids.
    const associatedUserNames = audioPidsToCreate.map((aid) => {
      const producingClient = client.room.clients.find((c) => c?.producer?.audio?.id === aid);
      return producingClient?.userName;
    });

    // Get the user roles of connected clients
    const associatedUserRoles = audioPidsToCreate.map((aid) => {
      const producingClient = client.room.clients.find((c) => c?.producer?.audio?.id === aid);
      return producingClient?.userRole || "candidate";
    });

    ackCb({
      routerRtpCapabilities: client.room.router.rtpCapabilities,
      newRoom,
      audioPidsToCreate,
      videoPidsToCreate,
      associatedUserNames,
      associatedUserRoles,
      chatHistory: client.room.getChatHistory(), // Send chat history when joining
    });
  });
  socket.on("requestTransport", async ({ type, audioPid }, ackCb) => {
    // whether producer or consumer, client needs params
    let clientTransportParams;
    if (type === "producer") {
      // run addClient, which is part of our Client class
      clientTransportParams = await client.addTransport(type);
    } else if (type === "consumer") {
      // we have 1 transport per client we are streaming from
      // each transport will have an audio and a video producer/consumer
      // we know the audio Pid (because it came from dominantSpeaker), get the video
      const producingClient = client.room.clients.find((c) => c?.producer?.audio?.id === audioPid);
      const videoPid = producingClient?.producer?.video?.id;

      // Add the socket ID of the producer to the transport params
      clientTransportParams = await client.addTransport(type, audioPid, videoPid);

      // Add the socket ID and role of the producer client to the transport params
      if (producingClient) {
        clientTransportParams.producerSocketId = producingClient.socket.id;
        clientTransportParams.producerRole = producingClient.userRole || "candidate";
      }
    }
    ackCb(clientTransportParams);
  });
  socket.on("connectTransport", async ({ dtlsParameters, type, audioPid }, ackCb) => {
    if (type === "producer") {
      try {
        await client.upstreamTransport.connect({ dtlsParameters });
        ackCb("success");
      } catch (error) {
        console.log(error);
        ackCb("error");
      }
    } else if (type === "consumer") {
      // find the right transport, for this consumer
      try {
        const downstreamTransport = client.downstreamTransports.find((t) => {
          return t.associatedAudioPid === audioPid;
        });
        downstreamTransport.transport.connect({ dtlsParameters });
        ackCb("success");
      } catch (error) {
        console.log(error);
        ackCb("error");
      }
    }
  });
  socket.on("startProducing", async ({ kind, rtpParameters }, ackCb) => {
    // create a producer with the rtpParameters we were sent
    try {
      const newProducer = await client.upstreamTransport.produce({ kind, rtpParameters });
      //add the producer to this client obect
      client.addProducer(kind, newProducer);
      if (kind === "audio") {
        client.room.activeSpeakerList.push(newProducer.id);
      }
      // the front end is waiting for the id
      ackCb(newProducer.id);
    } catch (err) {
      console.log(err);
      ackCb(err);
    }

    // run updateActiveSpeakers
    const newTransportsByPeer = updateActiveSpeakers(client.room, io);
    // newTransportsByPeer is an object, each property is a socket.id that
    // has transports to make. They are in an array, by pid
    for (const [socketId, audioPidsToCreate] of Object.entries(newTransportsByPeer)) {
      // we have the audioPidsToCreate this socket needs to create
      // map the video pids and the username
      const videoPidsToCreate = audioPidsToCreate.map((aPid) => {
        const producerClient = client.room.clients.find((c) => c?.producer?.audio?.id === aPid);
        return producerClient?.producer?.video?.id;
      });
      const associatedUserNames = audioPidsToCreate.map((aPid) => {
        const producerClient = client.room.clients.find((c) => c?.producer?.audio?.id === aPid);
        return producerClient?.userName;
      });
      const associatedUserRoles = audioPidsToCreate.map((aPid) => {
        const producerClient = client.room.clients.find((c) => c?.producer?.audio?.id === aPid);
        return producerClient?.userRole || "candidate";
      });
      io.to(socketId).emit("newProducersToConsume", {
        routerRtpCapabilities: client.room.router.rtpCapabilities,
        audioPidsToCreate,
        videoPidsToCreate,
        associatedUserNames,
        associatedUserRoles,
        activeSpeakerList: client.room.activeSpeakerList.slice(0, 5),
      });
    }
  });
  socket.on("audioChange", (typeOfChange) => {
    if (typeOfChange === "mute") {
      client?.producer?.audio?.pause();
    } else {
      client?.producer?.audio?.resume();
    }
  });
  socket.on("videoChange", (typeOfChange) => {
    if (typeOfChange === "pause") {
      client?.producer?.video?.pause();
    } else if (typeOfChange === "resume") {
      client?.producer?.video?.resume();
    }
  });
  socket.on("consumeMedia", async ({ rtpCapabilities, pid, kind }, ackCb) => {
    // will run twice for every peer to consume... once for video, once for audio
    console.log("Kind: ", kind, "   pid:", pid);
    // we will set up our clientConsumer, and send back the params
    // use the right transport and add/update the consumer in Client
    // confirm canConsume
    try {
      if (!client.room.router.canConsume({ producerId: pid, rtpCapabilities })) {
        ackCb("cannotConsume");
      } else {
        // we can consume!
        const downstreamTransport = client.downstreamTransports.find((t) => {
          if (kind === "audio") {
            return t.associatedAudioPid === pid;
          } else if (kind === "video") {
            return t.associatedVideoPid === pid;
          }
        });
        // create the consumer with the transport
        const newConsumer = await downstreamTransport.transport.consume({
          producerId: pid,
          rtpCapabilities,
          paused: true, //good practice
        });
        // add this newCOnsumer to the CLient
        client.addConsumer(kind, newConsumer, downstreamTransport);
        // respond with the params
        const clientParams = {
          producerId: pid,
          id: newConsumer.id,
          kind: newConsumer.kind,
          rtpParameters: newConsumer.rtpParameters,
        };
        ackCb(clientParams);
      }
    } catch (err) {
      console.log(err);
      ackCb("consumeFailed");
    }
  });
  socket.on("unpauseConsumer", async ({ pid, kind }, ackCb) => {
    const consumerToResume = client.downstreamTransports.find((t) => {
      return t?.[kind].producerId === pid;
    });
    await consumerToResume[kind].resume();
    ackCb();
  });

  // Handle user leaving the room
  socket.on("leaveRoom", () => {
    if (client && client.room) {
      // Get the user info before removing them
      const userInfo = {
        userName: client.userName,
        socketId: socket.id,
        userRole: client.userRole,
      };

      // Remove from activeSpeakerList if present
      if (client.producer && client.producer.audio) {
        const audioId = client.producer.audio.id;
        const index = client.room.activeSpeakerList.indexOf(audioId);
        if (index > -1) {
          client.room.activeSpeakerList.splice(index, 1);
        }
      }

      // Remove client from room
      const roomIndex = client.room.clients.findIndex((c) => c.socket.id === socket.id);
      if (roomIndex > -1) {
        client.room.clients.splice(roomIndex, 1);
      }

      // Notify other users in the room
      socket.to(client.room.roomName).emit("userLeft", userInfo);

      console.log(`User ${userInfo.userName} (${userInfo.userRole}) left room ${client.room.roomName}`);
    }
  });

  // Handle unexpected disconnection
  socket.on("disconnect", () => {
    if (client && client.room) {
      // Get the user info before removing them
      const userInfo = {
        userName: client.userName,
        socketId: socket.id,
        userRole: client.userRole,
      };

      // Remove from activeSpeakerList if present
      if (client.producer && client.producer.audio) {
        const audioId = client.producer.audio.id;
        const index = client.room.activeSpeakerList.indexOf(audioId);
        if (index > -1) {
          client.room.activeSpeakerList.splice(index, 1);
        }
      }

      // Remove client from room
      const roomIndex = client.room.clients.findIndex((c) => c.socket.id === socket.id);
      if (roomIndex > -1) {
        client.room.clients.splice(roomIndex, 1);
      }

      // Notify other users in the room
      socket.to(client.room.roomName).emit("userLeft", userInfo);

      console.log(`User ${userInfo.userName} (${userInfo.userRole}) disconnected from room ${client.room.roomName}`);
    }
  });
});

// Add body-parser middleware for JSON requests
const bodyParser = require("body-parser");
app.use(bodyParser.json());

// Keep track of transcriptions
const transcriptions = {
  candidate: [],
  interviewer: [],
};

// HTTP endpoint for receiving transcriptions
app.post("/api/transcription", (req, res) => {
  try {
    const { sender, transcript, timestamp } = req.body;
    const formattedTimestamp = timestamp || new Date().toISOString();

    if (!transcript) {
      return res.status(400).json({ error: "Transcript is required" });
    }

    // Log the transcription
    console.log(`[${formattedTimestamp}] ${sender || "Unknown"} Transcription: ${transcript}`);

    // Store the transcription
    if (sender === "candidate") {
      transcriptions.candidate.push({
        transcript,
        timestamp: formattedTimestamp,
      });

      // Log to a file
      fs.appendFileSync(
        path.join(__dirname, "candidate-transcriptions.txt"),
        `[${formattedTimestamp}] ${transcript}\n`,
        { encoding: "utf8" }
      );
    } else if (sender === "interviewer") {
      transcriptions.interviewer.push({
        transcript,
        timestamp: formattedTimestamp,
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Transcription received",
    });
  } catch (error) {
    console.error("Error processing transcription:", error);
    return res.status(500).json({
      status: "error",
      message: "Error processing transcription",
      error: error.message,
    });
  }
});

// HTTP endpoint for getting latest transcriptions
app.get("/api/transcriptions", (req, res) => {
  return res.status(200).json(transcriptions);
});

// HTTP endpoint for getting latest candidate transcriptions
app.get("/api/transcriptions/candidate", (req, res) => {
  return res.status(200).json(transcriptions.candidate);
});

// HTTP endpoint for getting latest interviewer transcriptions
app.get("/api/transcriptions/interviewer", (req, res) => {
  return res.status(200).json(transcriptions.interviewer);
});

// HTTP endpoint for clearing transcriptions
app.post("/api/transcriptions/clear", (req, res) => {
  transcriptions.candidate = [];
  transcriptions.interviewer = [];
  return res.status(200).json({
    status: "success",
    message: "Transcriptions cleared",
  });
});

// Serve static files (React build) for production
app.use(express.static(path.join(__dirname, "../front-end/dist")));

// Catch-all route to serve React's index.html
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../front-end/dist/index.html"));
});

// httpsServer.listen(config.port)
server.listen(config.currentEnv.port, () => {
  console.log(`Server running in ${config.currentEnv.mode} mode on port ${config.currentEnv.port}`);
});
