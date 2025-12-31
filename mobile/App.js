import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import ScheduleScreen from './src/screens/ScheduleScreen';
import LiveScreen from './src/screens/LiveScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import PhoneEntryScreen from './src/screens/PhoneEntryScreen';
import SmsCodeScreen from './src/screens/SmsCodeScreen';
import AccountScreen from './src/screens/AccountScreen';
import VerifyEmailScreen from './src/screens/VerifyEmailScreen';
import SubscribeScreen from './src/screens/SubscribeScreen';
import { colors } from './src/theme';
import Screen from './src/components/Screen';
import NavBar from './src/components/NavBar';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    text: colors.textPrimary,
    primary: colors.accent,
    notification: colors.accent
  }
};

function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarIcon: ({ color, size }) => {
          const map = {
            Home: 'home-outline',
            Live: 'radio-outline',
            Schedule: 'calendar-outline'
          };
          return <Ionicons name={map[route.name] || 'ellipse-outline'} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen
        name="Login"
        component={LoginScreen}
        options={{
          tabBarButton: () => null
        }}
      />
      <Tab.Screen name="AccountTab" component={AccountTab} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}

function AccountTab({ navigation }) {
  const [state, setState] = useState({ loading: true, loggedIn: false });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('https://racescan.racing/api/user-info', { credentials: 'include', cache: 'no-store' });
        const data = await res.json();
        if (!mounted) return;
        setState({ loading: false, loggedIn: !!data?.success });
      } catch {
        if (mounted) setState({ loading: false, loggedIn: false });
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  if (state.loading) {
    return (
      <Screen>
        <NavBar />
        <View style={{ padding: 20 }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!state.loggedIn) {
    return (
      <Screen>
        <NavBar />
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Sign up or log in</Text>
          <Text style={{ color: colors.textSecondary }}>Create an account to manage your passes and subscription.</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Signup')}
            style={{ backgroundColor: colors.accent, padding: 12, borderRadius: 12, alignItems: 'center' }}
            activeOpacity={0.9}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Sign Up</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            style={{ padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
            activeOpacity={0.9}
          >
            <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Log In</Text>
          </TouchableOpacity>
        </View>
      </Screen>
    );
  }

  return <AccountScreen navigation={navigation} />;
}

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={TabNavigator} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
          <Stack.Screen name="SmsCode" component={SmsCodeScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="Subscribe" component={SubscribeScreen} />
        </Stack.Navigator>
      </NavigationContainer>
  );
}
