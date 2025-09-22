import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="start" options={{ headerShown: false }} />
        <Stack.Screen name="bookshelf" options={{ headerShown: false }} />
        <Stack.Screen name="problem" options={{ headerShown: false }} />
        <Stack.Screen name="incorrect-notes" options={{ headerShown: false }} />
        <Stack.Screen name="problem-report" options={{ headerShown: false }} />
        <Stack.Screen name="chatlog-page" options={{ headerShown: false }} />
        <Stack.Screen name="chat-save" options={{ headerShown: false }} />
        <Stack.Screen name="create-folder" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
