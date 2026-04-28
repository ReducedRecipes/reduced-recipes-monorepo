import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock expo-router
const mockPush = vi.fn();
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock react-native with simple functional components
vi.mock("react-native", () => ({
  Pressable: vi.fn(({ children, ...props }: any) => ({
    type: "Pressable",
    props,
    children: typeof children === "function" ? children({}) : children,
  })),
  Text: vi.fn(({ children, ...props }: any) => ({
    type: "Text",
    props,
    children,
  })),
  View: vi.fn(({ children, ...props }: any) => ({
    type: "View",
    props,
    children: Array.isArray(children) ? children : [children],
  })),
  StyleSheet: { create: (s: any) => s },
}));

vi.mock("@/constants/theme", () => ({
  colors: {
    bg: "#F3F0EB", bgCard: "#FFFFFF", bgMuted: "#EDE9E3",
    ink: "#2D2923", ink2: "#5C5549", inkMuted: "#5C5549", inkFaint: "#8A8379",
    rule: "#D4CFC8", rule2: "#BFB9B0",
    accent: "#C45A30", accentLight: "#F5E6DD",
    orange: "#C45A30", orangeLight: "#F5E6DD",
  },
  fonts: {
    serif: "InstrumentSerif_400Regular", serifItalic: "InstrumentSerif_400Regular_Italic",
    sans: "Inter_400Regular", sansMedium: "Inter_500Medium",
    mono: "JetBrainsMono_400Regular", monoMedium: "JetBrainsMono_500Medium",
    display: "InstrumentSerif_400Regular", body: "Inter_400Regular", bodyMed: "Inter_500Medium",
  },
}));

import { routes } from "../constants/routes";

beforeEach(() => {
  mockPush.mockClear();
});

describe("TagPill", () => {
  it("exports a TagPill component", async () => {
    const mod = await import("../components/TagPill");
    expect(mod.TagPill).toBeDefined();
    expect(typeof mod.TagPill).toBe("function");
  });

  it("navigates to tag route on press", async () => {
    const { TagPill } = await import("../components/TagPill");
    const result = TagPill({ tag: "pasta" }) as any;
    result.props.onPress();
    expect(mockPush).toHaveBeenCalledWith(routes.tag("pasta"));
  });

  it("has accessible role and label", async () => {
    const { TagPill } = await import("../components/TagPill");
    const result = TagPill({ tag: "vegan" }) as any;
    expect(result.props.accessibilityRole).toBe("button");
    expect(result.props.accessibilityLabel).toBe("Tag: vegan");
  });

  it("has minimum 44pt touch target", async () => {
    const { TagPill } = await import("../components/TagPill");
    const result = TagPill({ tag: "test" }) as any;
    expect(result.props.style.minHeight).toBe(44);
    expect(result.props.style.minWidth).toBe(44);
  });

  it("uses border styling from StyleSheet", async () => {
    const { TagPill } = await import("../components/TagPill");
    const result = TagPill({ tag: "test" }) as any;
    expect(result.props.style.borderWidth).toBe(1);
  });
});

describe("TimeChip", () => {
  it("exports a TimeChip component", async () => {
    const mod = await import("../components/TimeChip");
    expect(mod.TimeChip).toBeDefined();
  });

  it("formats minutes under 60 as 'N min'", async () => {
    const { formatDuration } = await import("../components/TimeChip");
    expect(formatDuration(30)).toBe("30 min");
  });

  it("formats 90 minutes as '1 hr 30 min'", async () => {
    const { formatDuration } = await import("../components/TimeChip");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });

  it("formats exact hours as 'N hr'", async () => {
    const { formatDuration } = await import("../components/TimeChip");
    expect(formatDuration(120)).toBe("2 hr");
  });

  it("has minimum 44pt touch target", async () => {
    const { TimeChip } = await import("../components/TimeChip");
    const result = TimeChip({ minutes: 10 }) as any;
    expect(result.props.style.minHeight).toBe(44);
    expect(result.props.style.minWidth).toBe(44);
  });
});

describe("DomainBadge", () => {
  it("exports a DomainBadge component", async () => {
    const mod = await import("../components/DomainBadge");
    expect(mod.DomainBadge).toBeDefined();
  });

  it("navigates to site route on press", async () => {
    const { DomainBadge } = await import("../components/DomainBadge");
    const result = DomainBadge({ domain: "allrecipes.com" }) as any;
    result.props.onPress();
    expect(mockPush).toHaveBeenCalledWith(routes.site("allrecipes.com"));
  });

  it("has accessible role and label", async () => {
    const { DomainBadge } = await import("../components/DomainBadge");
    const result = DomainBadge({ domain: "food.com" }) as any;
    expect(result.props.accessibilityRole).toBe("button");
    expect(result.props.accessibilityLabel).toBe("Source: food.com");
  });

  it("has minimum 44pt touch target", async () => {
    const { DomainBadge } = await import("../components/DomainBadge");
    const result = DomainBadge({ domain: "test.com" }) as any;
    expect(result.props.style.minHeight).toBe(44);
    expect(result.props.style.minWidth).toBe(44);
  });

  it("uses border styling from StyleSheet", async () => {
    const { DomainBadge } = await import("../components/DomainBadge");
    const result = DomainBadge({ domain: "test.com" }) as any;
    expect(result.props.style.borderWidth).toBe(1);
  });
});
