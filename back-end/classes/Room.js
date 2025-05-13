const config = require("../config/config");
const newDominantSpeaker = require("../utilities/newDominantSpeaker");

// Rooms are not a MediaSoup thing. MS cares about mediastreams, transports,
// things like that. It doesn't care, or know, about rooms.
// Rooms can be inside of clients, clients inside of rooms,
// transports can belong to rooms or clients, etc.
class Room {
  constructor(roomName, workerToUse) {
    this.roomName = roomName;
    this.worker = workerToUse;
    this.router = null;
    //all the Client objects that are in this room
    this.clients = [];
    //an array of id's with the most recent dominant speaker first
    this.activeSpeakerList = [];
    // Add chat history to store messages
    this.chatHistory = [];
    // Maximum number of chat messages to keep in history
    this.maxChatHistoryLength = 100;
  }
  addClient(client) {
    this.clients.push(client);
  }
  createRouter(io) {
    return new Promise(async (resolve, reject) => {
      this.router = await this.worker.createRouter({
        mediaCodecs: config.routerMediaCodecs,
      });
      this.activeSpeakerObserver = await this.router.createActiveSpeakerObserver({
        interval: 300, //300 is default
      });
      this.activeSpeakerObserver.on("dominantspeaker", (ds) => newDominantSpeaker(ds, this, io));
      resolve();
    });
  }
  // Add method to store chat messages
  addChatMessage(message) {
    this.chatHistory.push(message);
    // Keep chat history within the maximum length
    if (this.chatHistory.length > this.maxChatHistoryLength) {
      this.chatHistory = this.chatHistory.slice(this.chatHistory.length - this.maxChatHistoryLength);
    }
    return message;
  }
  // Get recent chat history
  getChatHistory(limit = 50) {
    // Return most recent messages up to the limit
    return this.chatHistory.slice(-limit);
  }
}

module.exports = Room;
