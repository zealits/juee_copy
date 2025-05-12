const updateActiveSpeakers = require("./updateActiveSpeakers");

function newDominantSpeaker(ds, room, io) {
  console.log("======ds======", ds.producer.id);

  // Only update if we have a valid producer
  if (!ds || !ds.producer || !ds.producer.id) {
    return;
  }

  // look through this room's activeSpeakerList for this producer's pid
  const i = room.activeSpeakerList.findIndex((pid) => pid === ds.producer.id);

  if (i > -1) {
    // this person is in the list, and need to moved to the front
    const [pid] = room.activeSpeakerList.splice(i, 1);
    room.activeSpeakerList.unshift(pid);
  } else {
    // this is a new producer, just add to the front
    room.activeSpeakerList.unshift(ds.producer.id);
  }

  // Ensure we always have at least one active speaker
  if (room.activeSpeakerList.length === 0 && room.clients.length > 0) {
    // If no active speakers but we have clients, make the first client with audio the active speaker
    const firstClientWithAudio = room.clients.find((c) => c?.producer?.audio?.id);
    if (firstClientWithAudio) {
      room.activeSpeakerList.push(firstClientWithAudio.producer.audio.id);
    }
  }

  console.log("Active speakers:", room.activeSpeakerList);

  // Update active speakers and get new transports
  const newTransportsByPeer = updateActiveSpeakers(room, io);

  for (const [socketId, audioPidsToCreate] of Object.entries(newTransportsByPeer)) {
    // we have the audioPidsToCreate this socket needs to create
    // map the video pids and the username
    const videoPidsToCreate = audioPidsToCreate.map((aPid) => {
      const producerClient = room.clients.find((c) => c?.producer?.audio?.id === aPid);
      return producerClient?.producer?.video?.id;
    });
    const associatedUserNames = audioPidsToCreate.map((aPid) => {
      const producerClient = room.clients.find((c) => c?.producer?.audio?.id === aPid);
      return producerClient?.userName;
    });
    const associatedUserRoles = audioPidsToCreate.map((aPid) => {
      const producerClient = room.clients.find((c) => c?.producer?.audio?.id === aPid);
      return producerClient?.userRole || "candidate";
    });

    io.to(socketId).emit("newProducersToConsume", {
      routerRtpCapabilities: room.router.rtpCapabilities,
      audioPidsToCreate,
      videoPidsToCreate,
      associatedUserNames,
      associatedUserRoles,
      activeSpeakerList: room.activeSpeakerList.slice(0, 5),
    });
  }
}

module.exports = newDominantSpeaker;
