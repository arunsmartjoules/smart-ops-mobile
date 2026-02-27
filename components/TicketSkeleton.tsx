import React from "react";
import { View } from "react-native";
import Skeleton from "./Skeleton";

const TicketSkeleton = () => {
  return (
    <View style={{ paddingTop: 8 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton
          key={i}
          height={120}
          style={{ marginBottom: 16, borderRadius: 16 }}
        />
      ))}
    </View>
  );
};

export default TicketSkeleton;
