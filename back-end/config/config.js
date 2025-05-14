const config = {
  // Environment settings
  env: {
    development: {
      mode: "development",
      port: 3004,
      useHttps: false,
    },
    production: {
      mode: "production",
      port: 3004,
      useHttps: true,
      certPath: "../meetings-certs/fullchain.pem",
      keyPath: "../meetings-certs/privkey.pem",
    },
  },

  // Get current environment settings
  get currentEnv() {
    const env = process.env.NODE_ENV || "development";
    return this.env[env];
  },

  // Existing settings
  port: 3004,
  workerSettings: {
    //rtcMinPort and max are just arbitray ports for our traffic
    //useful for firewall or networking rules
    rtcMinPort: 40000,
    rtcMaxPort: 41000,
    //log levels you want to set
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
  },
  routerMediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
      },
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: {},
    },
  ],
  webRtcTransport: {
    listenIps: [
      {
        ip: "127.0.0.1", // for production for dev use 127.0.0.1
        //  announcedIp: "154.53.42.27", // for production for dev remove this
      },
    ],
    //For a typical video stream with HD quality, you might set maxIncomingBitrate
    //around 5 Mbps (5000 kbps) to balance quality and bandwidth.
    //4K Ultra HD: 15 Mbps to 25 Mbps
    maxIncomingBitrate: 5000000, // 5 Mbps, default is INF
    initialAvailableOutgoingBitrate: 5000000, // 5 Mbps, default is 600000
  },
};

module.exports = config;



// listenIps: [
//   process.env.NODE_ENV === "production"
//     ? {
//         ip: "0.0.0.0",
//         announcedIp: "154.53.42.27",
//       }
//     : {
//         ip: "127.0.0.1",
//       },
// ],