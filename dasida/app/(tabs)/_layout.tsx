import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
            height: 88,
            paddingBottom: 20,
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
          },
          default: {
            height: 60,
            borderTopWidth: 0,
            elevation: 0,
          },
        }),
        headerStyle: {
          height: 0,
        },
        headerTitleStyle: {
          display: 'none',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '내 서재',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
          tabBarStyle: { display: 'none' },
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: '내 pdf',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="magnifyingglass" color={color} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '서점',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="plus.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: '마이',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="bell.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
