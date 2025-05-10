"use client";

import { useState, useEffect, useCallback } from "react";
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";
import getMic2 from "../utils/getMic2";
import createProducerTransport from "../utils/mediaSoupFunctions/createProducerTransport";
import createProducer from "../utils/mediaSoupFunctions/createProducer";
import requestTransportToConsume from "../utils/mediaSoupFunctions/requestTransportToConsume";

const useMediaSoup = () => {
  const [socket, setSocket] = useState(null);
  const [device, setDevice] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [producerTransport, setProducerTransport] = useState(null);
  const [videoProducer, setVideoProducer] = useState(null);
  const [audioProducer, setAudioProducer] = useState(null);
  const [consumers, setConsumers] = useState({});
  const [activeSpeakers, setActiveSpeakers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [userRole, setUserRole] = useState("candidate");

  // UI state
  const [isJoined, setIsJoined] = useState(false);
  const [isFeedEnabled, setIsFeedEnabled] = useState(false);
  const [isFeedSending, setIsFeedSending] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);

  // Initialize socket connection
  useEffect(() => {
    const socketInstance = io.connect("https://meetings.aiiventure.com");

    socketInstance.on("connect", () => {
      console.log("Connected to socket server");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Handle active speakers updates
  useEffect(() => {
    if (!socket) return;

    const handleActiveSpeakers = (newListOfActives) => {
      console.log("Active speakers updated:", newListOfActives);
      setActiveSpeakers(newListOfActives);
    };

    socket.on("updateActiveSpeakers", handleActiveSpeakers);

    return () => {
      socket.off("updateActiveSpeakers", handleActiveSpeakers);
    };
  }, [socket, audioProducer]);

  // Handle user left event
  useEffect(() => {
    if (!socket) return;

    const handleUserLeft = (userInfo) => {
      console.log("User left:", userInfo);

      // Remove the user from consumers
      setConsumers((prevConsumers) => {
        const newConsumers = { ...prevConsumers };

        // Find and remove consumers associated with this user
        Object.keys(newConsumers).forEach((audioPid) => {
          if (newConsumers[audioPid].socketId === userInfo.socketId) {
            // Close the transport and consumers if they exist
            if (newConsumers[audioPid].transport) {
              newConsumers[audioPid].transport.close();
            }

            if (newConsumers[audioPid].audioConsumer) {
              newConsumers[audioPid].audioConsumer.close();
            }

            if (newConsumers[audioPid].videoConsumer) {
              newConsumers[audioPid].videoConsumer.close();
            }

            // Remove this consumer
            delete newConsumers[audioPid];
          }
        });

        return newConsumers;
      });

      // Add a notification
      const notificationId = Date.now();
      const newNotification = {
        id: notificationId,
        type: "userLeft",
        message: `${userInfo.userName} has left the meeting`,
        timestamp: new Date(),
      };

      setNotifications((prev) => [...prev, newNotification]);

      // Remove notification after 5 seconds
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      }, 5000);
    };

    socket.on("userLeft", handleUserLeft);

    return () => {
      socket.off("userLeft", handleUserLeft);
    };
  }, [socket]);

  // Handle new producers to consume
  useEffect(() => {
    if (!socket || !device) return;

    const handleNewProducers = (consumeData) => {
      console.log("New producers to consume:", consumeData);

      // Create a function that will update our consumers state
      const updateConsumers = (audioPid, consumerData) => {
        setConsumers((prev) => ({
          ...prev,
          [audioPid]: consumerData,
        }));
      };

      // Modified requestTransportToConsume to work with React state
      requestTransportToConsume(consumeData, socket, device, consumers, updateConsumers);
    };

    socket.on("newProducersToConsume", handleNewProducers);

    return () => {
      socket.off("newProducersToConsume", handleNewProducers);
    };
  }, [socket, device, consumers]);

  // Join room function
  const joinRoom = useCallback(
    async (roomName, userName, mediaOptions = null) => {
      if (!socket) return;

      try {
        // If mediaOptions is provided, use it (auto-join mode)
        if (mediaOptions && mediaOptions.localStream) {
          setLocalStream(mediaOptions.localStream);
          setIsFeedEnabled(true);

          // Set initial audio/video state based on media options
          if (!mediaOptions.isMicEnabled) {
            setIsAudioMuted(true);
          }

          if (!mediaOptions.isCameraEnabled) {
            setIsCameraEnabled(false);
          }

          // Set user role
          if (mediaOptions.userRole) {
            setUserRole(mediaOptions.userRole);
          }
        }

        const joinRoomResp = await socket.emitWithAck("joinRoom", {
          userName,
          roomName,
          userRole: mediaOptions?.userRole || "candidate",
        });

        console.log("Join room response:", joinRoomResp);

        const newDevice = new Device();
        await newDevice.load({
          routerRtpCapabilities: joinRoomResp.routerRtpCapabilities,
        });

        setDevice(newDevice);

        // Create a function that will update our consumers state
        const updateConsumers = (audioPid, consumerData) => {
          setConsumers((prev) => ({
            ...prev,
            [audioPid]: consumerData,
          }));
        };

        // Request to consume existing producers
        requestTransportToConsume(
          joinRoomResp,
          socket,
          newDevice,
          {}, // Empty consumers object initially
          updateConsumers
        );

        setIsJoined(true);

        // If we have mediaOptions, start sending the feed automatically
        if (mediaOptions && mediaOptions.localStream) {
          // We need to wait a bit for the device to be fully set up
          setTimeout(async () => {
            try {
              const transport = await createProducerTransport(socket, newDevice);
              setProducerTransport(transport);

              const producers = await createProducer(mediaOptions.localStream, transport);

              setAudioProducer(producers.audioProducer);
              setVideoProducer(producers.videoProducer);
              setIsFeedSending(true);

              // If audio is initially muted, pause the producer
              if (!mediaOptions.isMicEnabled && producers.audioProducer) {
                producers.audioProducer.pause();
                socket.emit("audioChange", "mute");
              }

              // If video is initially disabled, pause the video track
              if (!mediaOptions.isCameraEnabled && producers.videoProducer) {
                producers.videoProducer.pause();
                socket.emit("videoChange", "pause");
              }

              // Add a joining notification
              const notificationId = Date.now();
              const newNotification = {
                id: notificationId,
                type: "userJoined",
                message: "You have joined the meeting",
                timestamp: new Date(),
              };

              setNotifications((prev) => [...prev, newNotification]);

              // Remove notification after 5 seconds
              setTimeout(() => {
                setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
              }, 5000);
            } catch (error) {
              console.error("Error auto-starting feed:", error);
            }
          }, 1000);
        }
      } catch (error) {
        console.error("Error joining room:", error);
      }
    },
    [socket]
  );

  // Enable feed function - still kept for backward compatibility
  const enableFeed = useCallback(async () => {
    try {
      if (!localStream) {
        const mic2Id = await getMic2();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: { deviceId: { exact: mic2Id } },
        });

        setLocalStream(stream);
      }
      setIsFeedEnabled(true);
    } catch (error) {
      console.error("Error enabling feed:", error);
    }
  }, [localStream]);

  // Send feed function
  const sendFeed = useCallback(async () => {
    if (!socket || !device || !localStream) return;

    try {
      const transport = await createProducerTransport(socket, device);
      setProducerTransport(transport);

      const producers = await createProducer(localStream, transport);

      setAudioProducer(producers.audioProducer);
      setVideoProducer(producers.videoProducer);
      setIsFeedSending(true);
    } catch (error) {
      console.error("Error sending feed:", error);
    }
  }, [socket, device, localStream]);

  // Mute audio function
  const muteAudio = useCallback(() => {
    if (!audioProducer) return;

    if (audioProducer.paused) {
      // Currently paused. User wants to unpause
      audioProducer.resume();
      socket.emit("audioChange", "unmute");
      setIsAudioMuted(false);
    } else {
      // Currently on, user wants to pause
      audioProducer.pause();
      socket.emit("audioChange", "mute");
      setIsAudioMuted(true);
    }
  }, [audioProducer, socket]);

  // Toggle camera function
  const toggleCamera = useCallback(() => {
    if (!videoProducer || !localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    if (isCameraEnabled) {
      // Turn camera off
      videoProducer.pause();
      videoTrack.enabled = false;
      if (socket) {
        socket.emit("videoChange", "pause");
      }
      setIsCameraEnabled(false);
    } else {
      // Turn camera on
      videoProducer.resume();
      videoTrack.enabled = true;
      if (socket) {
        socket.emit("videoChange", "resume");
      }
      setIsCameraEnabled(true);
    }
  }, [videoProducer, localStream, isCameraEnabled, socket]);

  // End call function
  const endCall = useCallback(() => {
    if (!socket) return;

    try {
      // Clean up producers
      if (audioProducer) {
        audioProducer.close();
      }

      if (videoProducer) {
        videoProducer.close();
      }

      // Clean up transport
      if (producerTransport) {
        producerTransport.close();
      }

      // Close all consumer transports
      Object.values(consumers).forEach((consumer) => {
        if (consumer.transport) {
          consumer.transport.close();
        }
        if (consumer.audioConsumer) {
          consumer.audioConsumer.close();
        }
        if (consumer.videoConsumer) {
          consumer.videoConsumer.close();
        }
      });

      // Stop local media stream
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          track.stop();
        });
      }

      // Notify server
      socket.emit("leaveRoom");

      // Reset state
      setProducerTransport(null);
      setVideoProducer(null);
      setAudioProducer(null);
      setConsumers({});
      setActiveSpeakers([]);
      setLocalStream(null);
      setIsFeedSending(false);
      setIsFeedEnabled(false);
      setIsAudioMuted(false);
      setIsCameraEnabled(true);
      setIsJoined(false);
      setUserRole("candidate");

      console.log("Call ended successfully");
    } catch (error) {
      console.error("Error ending call:", error);
    }
  }, [socket, producerTransport, videoProducer, audioProducer, consumers, localStream]);

  // Clear a notification
  const clearNotification = useCallback((notificationId) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  }, []);

  return {
    joinRoom,
    enableFeed,
    sendFeed,
    muteAudio,
    toggleCamera,
    endCall,
    clearNotification,
    isJoined,
    isFeedEnabled,
    isFeedSending,
    isAudioMuted,
    isCameraEnabled,
    localStream,
    consumers,
    activeSpeakers,
    notifications,
    userRole,
  };
};

export default useMediaSoup;
