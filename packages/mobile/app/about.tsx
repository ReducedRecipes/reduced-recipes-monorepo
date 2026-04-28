import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Linking,
  StyleSheet,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { colors, fonts } from "@/constants/theme";

const VERSION = Constants.expoConfig?.version ?? "1.0.0";

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

        <Text style={styles.title}>About</Text>

        {/* Manifesto */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>
            {"\u25C6"} OUR PHILOSOPHY
          </Text>
          <View style={styles.rule} />

          <Text style={styles.manifestoHeading}>
            Recipes, reduced to what matters.
          </Text>

          <Text style={styles.bodyText}>
            ReducedRecipes was born from a simple frustration: you search for a
            recipe and get a 2,000-word essay about someone's childhood before
            you ever see an ingredient list. We believe cooking should start with
            cooking, not scrolling.
          </Text>

          <Text style={styles.bodyText}>
            Every recipe on ReducedRecipes is stripped to its essentials:
            ingredients, steps, and timing. No life stories. No pop-up ads. No
            auto-playing videos. Just the recipe.
          </Text>

          <Text style={styles.emphasisText}>
            Open source. Community-driven. Ad-free.
          </Text>

          <Text style={styles.bodyText}>
            We are an open-source project built by people who love to cook and
            believe recipes belong to everyone. Our code is public, our finances
            are transparent, and our community decides what we build next.
          </Text>

          <Text style={styles.bodyText}>
            ReducedRecipes is funded entirely by voluntary contributions from
            people who find it useful. No venture capital, no ads, no data
            selling. If it helps you cook, that is enough.
          </Text>
        </View>

        {/* Principles */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>
            {"\u25C6"} PRINCIPLES
          </Text>
          <View style={styles.rule} />

          {[
            {
              heading: "Just the recipe",
              body: "Ingredients and steps, nothing else. Your time matters.",
            },
            {
              heading: "No ads, ever",
              body: "We will never show advertisements. The product is the product.",
            },
            {
              heading: "Open source",
              body: "Every line of code is public. Inspect it, improve it, fork it.",
            },
            {
              heading: "Community-driven",
              body: "Features are suggested and voted on by the community. We build what you need.",
            },
            {
              heading: "Privacy-first",
              body: "We collect only what is necessary to make the app work. Your data stays yours.",
            },
          ].map((principle, i) => (
            <View key={i} style={styles.principleRow}>
              <Text style={styles.principleHeading}>{principle.heading}</Text>
              <Text style={styles.principleBody}>{principle.body}</Text>
            </View>
          ))}
        </View>

        {/* Links */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>
            {"\u25C6"} LINKS
          </Text>
          <View style={styles.rule} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => Linking.openURL("https://reducedrecipes.com")}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>reducedrecipes.com</Text>
            <Text style={styles.linkArrow}>{"\u2192"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() =>
              Linking.openURL("https://ko-fi.com/reducedrecipes")
            }
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>Support us on Ko-fi</Text>
            <Text style={styles.linkArrow}>{"\u2192"}</Text>
          </TouchableOpacity>
        </View>

        {/* Version */}
        <Text style={styles.versionText}>
          ReducedRecipes v{VERSION}
        </Text>
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
    marginBottom: 24,
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
  manifestoHeading: {
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.ink,
    marginBottom: 16,
    lineHeight: 30,
  },
  bodyText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    lineHeight: 24,
    marginBottom: 14,
  },
  emphasisText: {
    fontFamily: fonts.display,
    fontSize: 16,
    color: colors.orange,
    lineHeight: 24,
    marginBottom: 14,
  },
  principleRow: {
    marginBottom: 16,
  },
  principleHeading: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 4,
  },
  principleBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkMuted,
    lineHeight: 22,
  },
  linkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.bgMuted,
  },
  linkText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.orange,
  },
  linkArrow: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkFaint,
  },
  versionText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkFaint,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
});
