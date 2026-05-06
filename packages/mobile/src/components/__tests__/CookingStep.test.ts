import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: vi.fn(({ children, ...props }: any) => ({
    type: 'Pressable',
    props,
    children: typeof children === 'function' ? children({}) : children,
  })),
  Text: vi.fn(({ children, ...props }: any) => ({
    type: 'Text',
    props,
    children,
  })),
  View: vi.fn(({ children, ...props }: any) => ({
    type: 'View',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
  StyleSheet: { create: (styles: any) => styles, hairlineWidth: 0.5 },
}));

import { CookingStep } from '../CookingStep';

// React elements store children in props.children, while raw mock calls store in .children
// Serialize the full result and search for content in the JSON
function serialize(node: any): string {
  return JSON.stringify(node);
}

function findAll(node: any, predicate: (n: any) => boolean, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  // React element children are in props.children
  const children = node.props?.children ?? node.children;
  if (Array.isArray(children)) {
    for (const child of children) findAll(child, predicate, results);
  } else if (children && typeof children === 'object') {
    findAll(children, predicate, results);
  }
  return results;
}

function findByA11yLabel(node: any, label: string): any {
  const found = findAll(node, (n) => n.props?.accessibilityLabel === label);
  return found[0];
}

describe('CookingStep', () => {
  const baseProps = {
    stepText: 'Mix the flour and eggs',
    currentStep: 2,
    totalSteps: 5,
    onPrev: vi.fn(),
    onNext: vi.fn(),
  };

  it('exports CookingStep component', () => {
    expect(CookingStep).toBeDefined();
    expect(typeof CookingStep).toBe('function');
  });

  it('displays step progress text', () => {
    const result = CookingStep(baseProps) as any;
    const json = serialize(result);
    // Step text uses padStart(2, '0') for zero-padded numbers
    expect(json).toContain('Step ');
    expect(json).toContain(' of ');
  });

  it('displays step instruction text', () => {
    const result = CookingStep(baseProps) as any;
    const json = serialize(result);
    expect(json).toContain('Mix the flour and eggs');
  });

  it('renders progress bar with correct width', () => {
    const result = CookingStep(baseProps) as any;
    const json = serialize(result);
    expect(json).toContain('40%');
  });

  it('disables Prev button on first step', () => {
    const result = CookingStep({ ...baseProps, currentStep: 1 }) as any;
    const prevButton = findByA11yLabel(result, 'Previous step');
    expect(prevButton).toBeDefined();
    expect(prevButton.props.disabled).toBe(true);
  });

  it('enables Prev button on non-first step', () => {
    const result = CookingStep({ ...baseProps, currentStep: 3 }) as any;
    const prevButton = findByA11yLabel(result, 'Previous step');
    expect(prevButton).toBeDefined();
    expect(prevButton.props.disabled).toBe(false);
  });

  it('shows Done on last step', () => {
    const result = CookingStep({ ...baseProps, currentStep: 5 }) as any;
    const nextButton = findByA11yLabel(result, 'Last step');
    expect(nextButton).toBeDefined();
    expect(nextButton.props.disabled).toBe(true);
  });

  it('shows Next on non-last step', () => {
    const result = CookingStep(baseProps) as any;
    const nextButton = findByA11yLabel(result, 'Next step');
    expect(nextButton).toBeDefined();
    expect(nextButton.props.disabled).toBe(false);
  });

  it('calls onPrev when Prev is pressed', () => {
    const onPrev = vi.fn();
    const result = CookingStep({ ...baseProps, onPrev }) as any;
    const prevButton = findByA11yLabel(result, 'Previous step');
    prevButton.props.onPress();
    expect(onPrev).toHaveBeenCalled();
  });

  it('calls onNext when Next is pressed', () => {
    const onNext = vi.fn();
    const result = CookingStep({ ...baseProps, onNext }) as any;
    const nextButton = findByA11yLabel(result, 'Next step');
    nextButton.props.onPress();
    expect(onNext).toHaveBeenCalled();
  });

  it('renders step ingredients when provided', () => {
    const result = CookingStep({
      ...baseProps,
      stepIngredients: ['1 cup flour', '2 eggs'],
    }) as any;
    const json = serialize(result);
    expect(json).toContain('1 cup flour');
    expect(json).toContain('2 eggs');
    expect(json).toContain('Ingredients for this step');
  });

  it('does not render ingredients section when empty', () => {
    const result = CookingStep(baseProps) as any;
    const json = serialize(result);
    expect(json).not.toContain('Ingredients for this step');
  });

  it('renders timer when timerSeconds is provided', () => {
    const result = CookingStep({
      ...baseProps,
      timerSeconds: 300,
      timerRunning: false,
      timerRemaining: 300,
      onTimerToggle: vi.fn(),
    }) as any;
    const json = serialize(result);
    expect(json).toContain('5:00');
    expect(json).toContain('Tap to start');
  });

  it('shows pause label when timer is running', () => {
    const result = CookingStep({
      ...baseProps,
      timerSeconds: 300,
      timerRunning: true,
      timerRemaining: 180,
      onTimerToggle: vi.fn(),
    }) as any;
    const json = serialize(result);
    expect(json).toContain('3:00');
    expect(json).toContain('Tap to pause');
  });

  it('calls onTimerToggle when timer is pressed', () => {
    const onTimerToggle = vi.fn();
    const result = CookingStep({
      ...baseProps,
      timerSeconds: 300,
      timerRunning: false,
      timerRemaining: 300,
      onTimerToggle,
    }) as any;
    const found = findAll(result, (n) =>
      typeof n.props?.accessibilityLabel === 'string' &&
      n.props.accessibilityLabel.includes('Timer')
    );
    expect(found.length).toBeGreaterThan(0);
    found[0].props.onPress();
    expect(onTimerToggle).toHaveBeenCalled();
  });

  it('has accessibility live region for step announcements', () => {
    const result = CookingStep(baseProps) as any;
    expect(result.props.accessibilityLiveRegion).toBe('polite');
  });
});
