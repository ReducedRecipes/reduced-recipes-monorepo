import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts } from '@/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((w) => w.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  if (!isAuthenticated || !user) {
    return (
      <View style={st.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={st.ctaTitle}>Your Profile</Text>
        <Text style={st.ctaSubtitle}>
          Sign in to view your profile, collections, and followers.
        </Text>
        <TouchableOpacity
          style={st.ctaButton}
          onPress={() => router.replace('/(tabs)/settings')}
        >
          <Text style={st.ctaButtonText}>SIGN IN →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.backButtonCentered}
          onPress={() => router.back()}
        >
          <Text style={st.backButtonText}>← BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backButton}>
          <Text style={st.backArrow}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Profile</Text>
        <View style={st.backButton} />
      </View>

      <View style={st.profileTop}>
        {user.picture_url ? (
          <Image source={{ uri: user.picture_url }} style={st.avatar} />
        ) : (
          <View style={[st.avatar, st.avatarFallback]}>
            <Text style={st.avatarInitials}>{initials}</Text>
          </View>
        )}
        <Text style={st.displayName}>{user.name}</Text>
        <Text style={st.email}>{user.email}</Text>
      </View>

      <View style={st.sectionHeaderRow}>
        <Text style={st.sectionDiamond}>{'◆'}</Text>
        <Text style={st.sectionHeaderText}>ACCOUNT</Text>
        <View style={st.sectionRule} />
      </View>

      <View style={st.infoCard}>
        <View style={st.infoRow}>
          <Text style={st.infoLabel}>Member since</Text>
          <Text style={st.infoValue}>
            {user.created_at
              ? new Date(user.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                })
              : '—'}
          </Text>
        </View>
        <View style={st.infoRow}>
          <Text style={st.infoLabel}>Tier</Text>
          <Text style={st.infoValue}>{user.tier ?? 'free'}</Text>
        </View>
      </View>

      <Text style={st.helperText}>
        To sign out or delete your account, head back to Settings.
      </Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: {
    fontFamily: fonts.sans,
    fontSize: 24,
    color: colors.ink,
  },
  headerTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  backButtonCentered: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 16,
  },
  backButtonText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 1.5,
  },
  profileTop: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  avatarFallback: {
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.accent,
  },
  displayName: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 4,
  },
  email: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkFaint,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  sectionDiamond: {
    fontFamily: fonts.sans,
    fontSize: 10,
    color: colors.accent,
    marginRight: 8,
  },
  sectionHeaderText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginRight: 8,
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.rule,
  },
  infoCard: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  infoLabel: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  infoValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.inkFaint,
    letterSpacing: 0.5,
  },
  helperText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
  ctaTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: 8,
  },
  ctaSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  ctaButton: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  ctaButtonText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
