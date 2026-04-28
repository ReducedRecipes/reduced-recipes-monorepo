import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFunding } from "@/hooks/useFunding";
import { colors, fonts } from "@/constants/theme";

export default function TransparencyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch } = useFunding();

  const fundedWidth = data ? Math.min(data.funded_pct, 100) : 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 },
        ]}
      >
        {/* Back button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>{"\u2190"} Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Transparency</Text>
        <Text style={styles.subtitle}>
          Where your support goes, openly and honestly.
        </Text>

        {isLoading && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={colors.orange} />
            <Text style={styles.loadingText}>Loading funding data...</Text>
          </View>
        )}

        {error && !data && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>
              Could not load funding data. Please try again.
            </Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {data && (
          <>
            {/* Monthly cost + progress */}
            <View style={styles.card}>
              <Text style={styles.sectionHeader}>
                {"\u25C6"} MONTHLY COST
              </Text>
              <View style={styles.rule} />
              <Text style={styles.costAmount}>
                ${data.monthly_cost.toFixed(2)}
                <Text style={styles.costLabel}> / month</Text>
              </Text>

              <Text style={styles.progressLabel}>
                {data.funded_pct}% funded this month
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${fundedWidth}%` }]}
                />
              </View>
            </View>

            {/* Cost breakdown */}
            <View style={styles.card}>
              <Text style={styles.sectionHeader}>
                {"\u25C6"} COST BREAKDOWN
              </Text>
              <View style={styles.rule} />
              {data.breakdown.map((item, i) => (
                <View key={i} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{item.label}</Text>
                  <Text style={styles.breakdownCost}>
                    ${item.cost.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>

            {/* Recent supporters */}
            <View style={styles.card}>
              <Text style={styles.sectionHeader}>
                {"\u25C6"} RECENT SUPPORTERS
              </Text>
              <View style={styles.rule} />
              {data.supporters.length === 0 ? (
                <Text style={styles.emptyText}>
                  No supporters yet. Be the first!
                </Text>
              ) : (
                data.supporters.map((supporter, i) => (
                  <View key={i} style={styles.supporterRow}>
                    <Text style={styles.supporterName}>{supporter.name}</Text>
                    <Text style={styles.supporterAmount}>
                      ${supporter.amount.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {/* Ko-fi link */}
            <TouchableOpacity
              style={styles.kofiButton}
              onPress={() =>
                Linking.openURL("https://ko-fi.com/reducedrecipes")
              }
              accessibilityRole="link"
              accessibilityLabel="Support us on Ko-fi"
            >
              <Text style={styles.kofiButtonText}>Support us on Ko-fi</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 16,
  },
  backButton: {
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  backText: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.orange,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkMuted,
    lineHeight: 22,
    marginBottom: 24,
  },
  loadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkMuted,
  },
  errorWrap: {
    alignItems: "center",
    paddingVertical: 40,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.error,
    textAlign: "center",
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.orangeLight,
  },
  retryText: {
    fontFamily: fonts.bodyMed,
    fontSize: 14,
    color: colors.orange,
  },
  card: {
    backgroundColor: colors.bgCard,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    fontFamily: fonts.bodyMed,
    fontSize: 11,
    color: colors.inkMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.bgMuted,
    marginBottom: 16,
  },
  costAmount: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 12,
  },
  costLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkMuted,
  },
  progressLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
    marginBottom: 6,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.bgMuted,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.orange,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bgMuted,
  },
  breakdownLabel: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  breakdownCost: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.ink,
  },
  supporterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bgMuted,
  },
  supporterName: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    flex: 1,
  },
  supporterAmount: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.orange,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkFaint,
    textAlign: "center",
    paddingVertical: 16,
  },
  kofiButton: {
    backgroundColor: colors.orange,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  kofiButtonText: {
    fontFamily: fonts.bodyMed,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
