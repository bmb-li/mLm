import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Keyboard } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../contexts/I18nContext'
import MainChatScreen from '../screens/MainChatScreen'
import ModelScreen from '../screens/ModelScreen'
import LocalServerScreen from '../screens/LocalServerScreen'
import SettingsScreen from '../screens/SettingsScreen'
import type { TabParamList } from '../types/navigation'

const AUTO_SERVER_KEY = '@llama_auto_start_server'
const Tab = createBottomTabNavigator<TabParamList>()

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  const { theme } = useTheme()
  const color = focused
    ? theme.colors.tabBarActiveText
    : theme.colors.tabBarInactiveText

  const iconMap: Record<string, string> = {
    chat: focused ? '💬' : '💭',
    cube: focused ? '📦' : '📋',
    server: '🖥️',
    cog: focused ? '⚙️' : '🔧',
  }

  return (
    <View style={tabStyles.iconContainer}>
      <Text style={[tabStyles.icon, { color }]}>
        {iconMap[icon] || '❓'}
      </Text>
    </View>
  )
}

function TabLabel({ labelKey }: { labelKey: string }) {
  const { t } = useI18n()
  const { theme } = useTheme()
  const colors = theme.colors
  return (
    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.tabBarActiveText }}>
      {t.tabs[labelKey]}
    </Text>
  )
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
  },
  icon: {
    fontSize: 22,
  },
})

export default function MainTabNavigator() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const [initialTab, setInitialTab] = useState<'HomeTab' | 'ServerTab' | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(AUTO_SERVER_KEY).then(val => {
      setInitialTab(val === 'true' ? 'ServerTab' : 'HomeTab')
    }).catch(() => setInitialTab('HomeTab'))
  }, [])

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true)
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  if (!initialTab) return null

  return (
    <Tab.Navigator
      id="MainTabs"
      initialRouteName={initialTab}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBarBackground,
          borderTopWidth: 0,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          display: keyboardVisible ? 'none' : 'flex',
        },
        tabBarActiveTintColor: theme.colors.tabBarActiveText,
        tabBarInactiveTintColor: theme.colors.tabBarInactiveText,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={MainChatScreen}
        options={{
          tabBarLabel: ({ focused, color }) => <TabLabel labelKey="chat" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="chat" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ModelTab"
        component={ModelScreen}
        options={{
          tabBarLabel: ({ focused, color }) => <TabLabel labelKey="models" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="cube" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ServerTab"
        component={LocalServerScreen}
        options={{
          tabBarLabel: ({ focused, color }) => <TabLabel labelKey="server" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="server" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: ({ focused, color }) => <TabLabel labelKey="settings" />,
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="cog" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
