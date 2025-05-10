import { useEffect } from "react";
import { X } from "lucide-react";

const NotificationSystem = ({ notifications, clearNotification }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          notification={notification}
          onClose={() => clearNotification(notification.id)}
        />
      ))}
    </div>
  );
};

const Notification = ({ notification, onClose }) => {
  useEffect(() => {
    // Auto-close after 5 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  let bgColor = "bg-slate-700";
  let icon = null;

  switch (notification.type) {
    case "userLeft":
      bgColor = "bg-red-500/10 border-red-500/20";
      icon = (
        <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center mr-3">
          <span className="text-red-500 text-lg font-bold">!</span>
        </div>
      );
      break;
    case "userJoined":
      bgColor = "bg-emerald-500/10 border-emerald-500/20";
      icon = (
        <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center mr-3">
          <span className="text-emerald-500 text-lg font-bold">✓</span>
        </div>
      );
      break;
    default:
      bgColor = "bg-blue-500/10 border-blue-500/20";
      icon = (
        <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center mr-3">
          <span className="text-blue-500 text-lg font-bold">i</span>
        </div>
      );
  }

  return (
    <div className={`flex items-center rounded-lg p-3 border ${bgColor} text-white animate-fadeIn`}>
      {icon}
      <div className="flex-1">{notification.message}</div>
      <button onClick={onClose} className="ml-3 text-slate-400 hover:text-white transition-colors">
        <X size={16} />
      </button>
    </div>
  );
};

export default NotificationSystem;
