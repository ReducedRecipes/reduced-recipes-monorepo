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
    expect(result.props.className).toContain("min-h-[44px]");
    expect(result.props.className).toContain("min-w-[44px]");
  });

  it("uses pill shape with orange-light background", async () => {
    const { TagPill } = await import("../components/TagPill");
    const result = TagPill({ tag: "test" }) as any;
    expect(result.props.className).toContain("rounded-full");
    expect(result.props.className).toContain("bg-orange-50");
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
    expect(result.props.className).toContain("min-h-[44px]");
    expect(result.props.className).toContain("min-w-[44px]");
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
    expect(result.props.className).toContain("min-h-[44px]");
    expect(result.props.className).toContain("min-w-[44px]");
  });

  it("uses muted background", async () => {
    const { DomainBadge } = await import("../components/DomainBadge");
    const result = DomainBadge({ domain: "test.com" }) as any;
    expect(result.props.className).toContain("bg-gray-100");
  });
});
