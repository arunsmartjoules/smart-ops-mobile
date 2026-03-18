import React from "react";
import { View } from "react-native";
import Skeleton from "./Skeleton";

const TicketSkeletonItem = () => (
  <View
    className="bg-white dark:bg-slate-900 rounded-3xl p-5 mb-4 border border-slate-100 dark:border-slate-800"
    style={{
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.04,
      shadowRadius: 12,
      elevation: 2,
    }}
  >
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
      }}
    >
      <View style={{ flex: 1, marginRight: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Skeleton width={60} height={12} borderRadius={4} />
          <View
            style={{
              marginHorizontal: 8,
              width: 4,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#f1f5f9",
            }}
          />
          <Skeleton width={40} height={12} borderRadius={4} />
        </View>
        <Skeleton
          width="90%"
          height={22}
          borderRadius={6}
          style={{ marginBottom: 6 }}
        />
        <Skeleton width="60%" height={22} borderRadius={6} />
      </View>
      <Skeleton width={80} height={28} borderRadius={10} />
    </View>

    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingTop: 16,
        marginTop: 4,
        borderTopWidth: 1,
        borderTopColor: "rgba(226, 232, 240, 0.4)",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        <Skeleton
          width={14}
          height={14}
          borderRadius={7}
          style={{ marginRight: 6 }}
        />
        <Skeleton width={120} height={12} borderRadius={4} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Skeleton
          width={14}
          height={14}
          borderRadius={7}
          style={{ marginRight: 6 }}
        />
        <Skeleton width={60} height={12} borderRadius={4} />
      </View>
    </View>
  </View>
);

const TicketSkeleton = ({ count = 5 }: { count?: number }) => {
  return (
    <View style={{ paddingTop: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <TicketSkeletonItem key={i} />
      ))}
    </View>
  );
};

export default TicketSkeleton;
export { TicketSkeletonItem };
