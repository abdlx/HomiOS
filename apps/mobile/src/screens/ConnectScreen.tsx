import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useInstances } from '@/context/InstanceContext';
import { normalizeBaseUrl } from '@/api/HomiOSClient';

export function ConnectScreen() {
  const { probeServer, loginAndConnect } = useInstances();

  // Step 1 = Enter URL, Step 2 = Enter Login Credentials
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state
  const [url, setUrl] = useState('');
  const [normalizedUrl, setNormalizedUrl] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  // Step 2 state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [showTotpField, setShowTotpField] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handleNext = async () => {
    setProbeError(null);
    if (!url.trim()) {
      setProbeError('Please enter your HomiOS server URL or IP address.');
      return;
    }

    setProbing(true);
    try {
      const result = await probeServer(url);
      setNormalizedUrl(result.normalizedUrl);
      setStep(2);
    } catch (err: any) {
      setProbeError(err?.message || 'Could not reach HomiOS. Please check the URL.');
    } finally {
      setProbing(false);
    }
  };

  const handleLogin = async () => {
    setLoginError(null);
    if (!email.trim() || !password) {
      setLoginError('Email and password are required.');
      return;
    }

    setLoggingIn(true);
    try {
      const res = await loginAndConnect({
        baseUrl: normalizedUrl || url,
        email: email.trim(),
        password,
        totp: totp.trim() || undefined,
      });

      if (!res.ok) {
        if ('totpRequired' in res && res.totpRequired) {
          setShowTotpField(true);
          setLoginError('Enter the 6-digit code from your authenticator app.');
        } else if ('error' in res && res.error) {
          setLoginError(res.error);
        }
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand Header */}
          <View style={styles.brandContainer}>
            <View style={styles.logoBadge}>
              <MaterialCommunityIcons name="server-network" size={42} color="#38bdf8" />
            </View>
            <Text style={styles.brandTitle}>HomiFiles</Text>
            <Text style={styles.brandSubtitle}>
              Your self-hosted home server files on your phone.
            </Text>
          </View>

          {/* Step 1: Server URL */}
          {step === 1 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="globe" size={20} color="#38bdf8" />
                <Text style={styles.cardTitle}>Connect to Server</Text>
              </View>

              <Text style={styles.cardDescription}>
                Enter the IP address or web URL where your HomiOS server is running.
              </Text>

              <View style={styles.inputContainer}>
                <Ionicons name="link-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  value={url}
                  onChangeText={(text) => {
                    setUrl(text);
                    if (probeError) setProbeError(null);
                  }}
                  placeholder="e.g. 192.168.1.100:8740"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.input}
                />
                {url.length > 0 && (
                  <Pressable onPress={() => setUrl('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={18} color="#64748b" />
                  </Pressable>
                )}
              </View>

              {probeError && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#ef4444" />
                  <Text style={styles.errorText}>{probeError}</Text>
                </View>
              )}

              <View style={styles.hintsBox}>
                <Text style={styles.hintTitle}>Tip:</Text>
                <Text style={styles.hintText}>
                  Default HomiOS port is <Text style={styles.boldText}>8740</Text>. If you enter{' '}
                  <Text style={styles.codeText}>192.168.1.5</Text>, we'll automatically connect to{' '}
                  <Text style={styles.codeText}>http://192.168.1.5:8740</Text>.
                </Text>
              </View>

              <Pressable
                disabled={probing}
                onPress={handleNext}
                style={[styles.primaryButton, probing && styles.buttonDisabled]}
              >
                {probing ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Checking Server...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonRow}>
                    <Text style={styles.primaryButtonText}>Next</Text>
                    <Feather name="arrow-right" size={18} color="#ffffff" />
                  </View>
                )}
              </Pressable>
            </View>
          )}

          {/* Step 2: Login Form */}
          {step === 2 && (
            <View style={styles.card}>
              {/* Verified Server Pill */}
              <View style={styles.verifiedPill}>
                <View style={styles.verifiedDot} />
                <Text style={styles.verifiedUrl} numberOfLines={1}>
                  {normalizedUrl}
                </Text>
                <Pressable
                  onPress={() => {
                    setStep(1);
                    setLoginError(null);
                  }}
                  style={styles.changeUrlButton}
                >
                  <Text style={styles.changeUrlText}>Change</Text>
                </Pressable>
              </View>

              <View style={styles.cardHeader}>
                <Feather name="lock" size={20} color="#38bdf8" />
                <Text style={styles.cardTitle}>Log In to HomiOS</Text>
              </View>

              <Text style={styles.cardDescription}>
                Enter your HomiOS user credentials to access your files and drives.
              </Text>

              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Feather name="mail" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="admin@homios.local"
                  placeholderTextColor="#64748b"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={styles.input}
                />
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <Feather name="key" size={18} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (loginError) setLoginError(null);
                  }}
                  placeholder="Password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={styles.input}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={10}>
                  <Feather
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={18}
                    color="#94a3b8"
                  />
                </Pressable>
              </View>

              {/* TOTP 2FA Input (if required or enabled) */}
              {showTotpField && (
                <View style={[styles.inputContainer, styles.totpContainer]}>
                  <MaterialCommunityIcons
                    name="shield-key-outline"
                    size={20}
                    color="#38bdf8"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={totp}
                    onChangeText={(text) => {
                      setTotp(text);
                      if (loginError) setLoginError(null);
                    }}
                    placeholder="6-digit Authenticator code"
                    placeholderTextColor="#64748b"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={styles.input}
                  />
                </View>
              )}

              {loginError && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#ef4444" />
                  <Text style={styles.errorText}>{loginError}</Text>
                </View>
              )}

              <Pressable
                disabled={loggingIn}
                onPress={handleLogin}
                style={[styles.primaryButton, loggingIn && styles.buttonDisabled]}
              >
                {loggingIn ? (
                  <View style={styles.buttonLoadingRow}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Signing In...</Text>
                  </View>
                ) : (
                  <Text style={styles.primaryButtonText}>Log In</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => {
                  setStep(1);
                  setLoginError(null);
                }}
                style={styles.backButton}
              >
                <Feather name="arrow-left" size={16} color="#94a3b8" />
                <Text style={styles.backButtonText}>Back to server selection</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0c',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#161922',
    borderWidth: 1.5,
    borderColor: '#262a38',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 8,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: '#8e95a5',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#14161d',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#232733',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  cardDescription: {
    fontSize: 13,
    color: '#8e95a5',
    lineHeight: 18,
    marginBottom: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1f2a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c3142',
    paddingHorizontal: 14,
    minHeight: 52,
    marginBottom: 14,
  },
  totpContainer: {
    borderColor: '#38bdf8',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b1219',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#68202d',
    padding: 12,
    gap: 8,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    color: '#f87171',
    fontSize: 13,
    lineHeight: 18,
  },
  hintsBox: {
    backgroundColor: '#191d28',
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  hintTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  hintText: {
    color: '#8e95a5',
    fontSize: 12,
    lineHeight: 17,
  },
  boldText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  codeText: {
    color: '#38bdf8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#172224',
    borderWidth: 1,
    borderColor: '#1f3d35',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    gap: 8,
  },
  verifiedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  verifiedUrl: {
    flex: 1,
    color: '#a7f3d0',
    fontSize: 12,
    fontWeight: '600',
  },
  changeUrlButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  changeUrlText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
  },
  backButtonText: {
    color: '#8e95a5',
    fontSize: 13,
  },
});
