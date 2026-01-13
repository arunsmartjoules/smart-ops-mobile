import { TouchableOpacity, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight } from "lucide-react-native";

interface DashboardCardProps {
  title: string;
  count: number;
  status?: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  color: string;
}

const DashboardCard = ({
  title,
  count,
  status,
  icon: Icon,
  color,
}: DashboardCardProps) => {
  const isStatusCard = status !== undefined;

  // Map colors to gradient pairs
  const colorGradients: Record<string, [string, string]> = {
    "bg-green-500": ["#10b981", "#059669"],
    "bg-red-500": ["#ef4444", "#dc2626"],
    "bg-blue-500": ["#3b82f6", "#2563eb"],
    "bg-yellow-500": ["#f59e0b", "#d97706"],
  };

  const gradientColors = colorGradients[color] || ["#6b7280", "#4b5563"];

  return (
    <TouchableOpacity
      className="bg-white rounded-lg p-4 flex-row justify-between items-center active:bg-gray-50"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        borderWidth: 1,
        borderColor: "#f3f4f6",
      }}
    >
      <View className="flex-row items-center flex-1">
        <View
          className="rounded-lg mr-4 overflow-hidden"
          style={{
            shadowColor: gradientColors[0],
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3,
            elevation: 2,
          }}
        >
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="p-3.5"
          >
            <Icon size={24} color="white" />
          </LinearGradient>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
            {title}
          </Text>
          {isStatusCard ? (
            <Text className="text-xl font-bold text-green-600">{status}</Text>
          ) : (
            <Text className="text-3xl font-bold text-gray-800">{count}</Text>
          )}
        </View>
      </View>
      <View className="bg-gray-100 p-2 rounded-full">
        <ChevronRight size={18} color="#6b7280" />
      </View>
    </TouchableOpacity>
  );
};

export default DashboardCard;
