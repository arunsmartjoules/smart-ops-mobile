import { Alert, Platform } from "react-native";

interface AlertButton {
  text: string;
  onPress?: () => void;
}

export const showAlert = (
  title: string,
  message: string,
  buttons?: AlertButton[]
) => {
  if (Platform.OS === "web") {
    // For web, use window.alert and handle button actions
    const fullMessage = `${title}\n\n${message}`;
    window.alert(fullMessage);

    // Execute the first button's onPress if available
    if (buttons && buttons.length > 0 && buttons[0].onPress) {
      buttons[0].onPress();
    }
  } else {
    // For native, use React Native Alert
    Alert.alert(title, message, buttons);
  }
};
