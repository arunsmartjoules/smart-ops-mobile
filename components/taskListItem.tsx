import { TouchableOpacity, Text, View } from "react-native";
import { ChevronRight, Clock } from "lucide-react-native";

const TaskListItem = ({ task }: any) => {
  const Icon = task.icon;

  // Map text colors to hex values
  const colorMap: Record<string, string> = {
    "text-red-600": "#dc2626",
    "text-blue-600": "#2563eb",
    "text-yellow-600": "#ca8a04",
  };

  const iconColor = colorMap[task.color] || "#6b7280";

  // Map border colors to hex
  const borderColorMap: Record<string, string> = {
    "border-red-500": "#ef4444",
    "border-blue-500": "#3b82f6",
    "border-yellow-500": "#eab308",
  };

  const borderColor = borderColorMap[task.border] || "#6b7280";

  return (
    <TouchableOpacity
      className="bg-white rounded-lg p-4 flex-row justify-between items-center active:bg-gray-50"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
        borderWidth: 1,
        borderColor: "#f3f4f6",
      }}
    >
      <View className="flex-row items-center flex-1 pr-2">
        <View
          className="rounded-lg p-2.5 mr-3"
          style={{
            backgroundColor: `${iconColor}15`,
            shadowColor: iconColor,
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.15,
            shadowRadius: 2,
            elevation: 1,
          }}
        >
          <Icon size={20} color={iconColor} />
        </View>
        <View className="flex-1">
          <Text
            className="text-sm font-bold text-gray-800 mb-1.5"
            numberOfLines={2}
          >
            {task.title}
          </Text>

          <View className="flex-row items-center flex-wrap gap-2">
            <View className="bg-gray-100 px-2.5 py-1 rounded-lg">
              <Text className={`text-xs font-bold ${task.color}`}>
                {task.type}
              </Text>
            </View>

            <View className="flex-row items-center">
              <Clock size={12} color="#9ca3af" />
              <Text className="text-xs text-gray-500 ml-1 font-medium">
                {task.due}
              </Text>
            </View>

            {task.urgency === "High" && (
              <View className="bg-red-500 px-2.5 py-1 rounded-lg">
                <Text className="text-white text-xs font-bold">URGENT</Text>
              </View>
            )}

            {task.urgency === "Immediate" && (
              <View className="bg-amber-500 px-2.5 py-1 rounded-lg">
                <Text className="text-white text-xs font-bold">IMMEDIATE</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      <View className="bg-gray-100 p-2 rounded-full ml-2">
        <ChevronRight size={16} color="#6b7280" />
      </View>
    </TouchableOpacity>
  );
};

export default TaskListItem;
