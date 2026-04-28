import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts } from '@/constants/theme';

const API_BASE = `${process.env.EXPO_PUBLIC_API_BASE || 'https://reducedrecipes.com'}/api/v1`;

interface UserProfile {
  id: string;
  name: string;
  email?: string;
  picture_url?: string;
  follower_count?: number;
  following_count?: number;
  is_following?: boolean;
  collections?: Collection[];
}

interface Collection {
  id: string;
  name: string;
  recipe_count: number;
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!id) return;

    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    fetch(`${API_BASE}/users/${id}`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load profile');
        return res.json();
      })
      .then((data) => {
        const user = data.user ?? data;
        setProfile(user);
        setIsFollowing(user.is_following ?? false);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [id, sessionToken]);

  const handleFollowToggle = useCallback(async () => {
    if (!sessionToken || !id || followLoading) return;
    setFollowLoading(true);

    try {
      const method = isFollowing ? 'DELETE' : 'POST';
      const res = await fetch(`${API_BASE}/users/${id}/follow`, {
        method,
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (res.ok) {
        setIsFollowing(!isFollowing);
        setProfile((prev) => {
          if (!prev) return prev;
          const delta = isFollowing ? -1 : 1;
          return {
            ...prev,
            follower_count: (prev.follower_count ?? 0) + delta,
          };
        });
      }
    } catch {
      // Silently handle follow errors
    } finally {
      setFollowLoading(false);
    }
  }, [sessionToken, id, isFollowing, followLoading]);

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
        {profile.email ? <Text style={st.email}>{profile.email}</Text> : null}
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

      {/* Follow / Unfollow Button */}
      {sessionToken ? (
        <TouchableOpacity
          style={[st.followButton, isFollowing && st.followButtonActive]}
          onPress={handleFollowToggle}
          disabled={followLoading}
        >
          <Text style={[st.followButtonText, isFollowing && st.followButtonTextActive]}>
            {followLoading ? '...' : isFollowing ? 'FOLLOWING' : 'FOLLOW'}
          </Text>
        </TouchableOpacity>
      ) : null}

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
          <Text style={st.emptyText}>No public collections</Text>
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
  followButton: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
  followButtonActive: {
    backgroundColor: colors.bgCard,
    borderColor: colors.rule,
  },
  followButtonText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.bgCard,
    letterSpacing: 1.5,
  },
  followButtonTextActive: {
    color: colors.ink,
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
});
