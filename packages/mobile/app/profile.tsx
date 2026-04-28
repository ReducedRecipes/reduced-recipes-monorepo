import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts } from '@/constants/theme';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE || 'https://reducedrecipes.com'}/api/v1`;

interface UserProfile {
  id: string;
  name: string;
  email: string;
  picture_url?: string;
  follower_count?: number;
  following_count?: number;
  collections?: Collection[];
}

interface Collection {
  id: string;
  name: string;
  recipe_count: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionToken) {
      setIsLoading(false);
      return;
    }

    fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load profile');
        return res.json();
      })
      .then((data) => {
        setProfile(data.user ?? data);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [sessionToken]);

  const initials = profile?.name
    ? profile.name
        .split(' ')
        .map((w) => w.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  if (isLoading) {
    return (
      <View style={st.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={st.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={st.ctaTitle}>Your Profile</Text>
        <Text style={st.ctaSubtitle}>Sign in to view your profile, collections, and followers.</Text>
        <TouchableOpacity style={st.ctaButton} onPress={() => router.replace('/(tabs)/settings')}>
          <Text style={st.ctaButtonText}>SIGN IN →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.backButtonCentered} onPress={() => router.back()}>
          <Text style={st.backButtonText}>← BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={st.centered}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={st.errorText}>{error || 'Could not load profile'}</Text>
        <TouchableOpacity style={st.backButtonCentered} onPress={() => router.back()}>
          <Text style={st.backButtonText}>GO BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={st.backButton}>
          <Text style={st.backArrow}>{'\u2190'}</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>Profile</Text>
        <View style={st.backButton} />
      </View>

      {/* Avatar + Name */}
      <View style={st.profileTop}>
        {profile.picture_url ? (
          <Image source={{ uri: profile.picture_url }} style={st.avatar} />
        ) : (
          <View style={[st.avatar, st.avatarFallback]}>
            <Text style={st.avatarInitials}>{initials}</Text>
          </View>
        )}
        <Text style={st.displayName}>{profile.name}</Text>
        <Text style={st.email}>{profile.email}</Text>
      </View>

      {/* Stats Row */}
      <View style={st.statsRow}>
        <View style={st.statBox}>
          <Text style={st.statNumber}>{profile.follower_count ?? 0}</Text>
          <Text style={st.statLabel}>FOLLOWERS</Text>
        </View>
        <View style={[st.statBox, st.statBoxMiddle]}>
          <Text style={st.statNumber}>{profile.following_count ?? 0}</Text>
          <Text style={st.statLabel}>FOLLOWING</Text>
        </View>
        <View style={st.statBox}>
          <Text style={st.statNumber}>{profile.collections?.length ?? 0}</Text>
          <Text style={st.statLabel}>COLLECTIONS</Text>
        </View>
      </View>

      {/* Edit Profile Button */}
      <TouchableOpacity style={st.editButton} onPress={() => {}}>
        <Text style={st.editButtonText}>EDIT PROFILE</Text>
      </TouchableOpacity>

      {/* Collections */}
      <View style={st.sectionHeaderRow}>
        <Text style={st.sectionDiamond}>{'\u25C6'}</Text>
        <Text style={st.sectionHeaderText}>COLLECTIONS</Text>
        <View style={st.sectionRule} />
      </View>

      {profile.collections && profile.collections.length > 0 ? (
        <View style={st.collectionsContainer}>
          {profile.collections.map((collection) => (
            <View key={collection.id} style={st.collectionRow}>
              <Text style={st.collectionName}>{collection.name}</Text>
              <Text style={st.collectionCount}>
                {collection.recipe_count} {collection.recipe_count === 1 ? 'recipe' : 'recipes'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={st.emptyState}>
          <Text style={st.emptyText}>No collections yet</Text>
        </View>
      )}
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
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.inkFaint,
    marginBottom: 16,
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
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statBoxMiddle: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.rule,
  },
  statNumber: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  editButton: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bgCard,
  },
  editButtonText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 1.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 32,
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
  collectionsContainer: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  collectionName: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
  },
  collectionCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 0.5,
  },
  emptyState: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkFaint,
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
