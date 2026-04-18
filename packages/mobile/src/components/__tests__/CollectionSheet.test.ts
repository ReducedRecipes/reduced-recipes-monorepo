import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('react-native', () => ({
  ActivityIndicator: vi.fn(({ ...props }: any) => ({
    type: 'ActivityIndicator',
    props,
  })),
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
  TextInput: vi.fn(({ ...props }: any) => ({
    type: 'TextInput',
    props,
  })),
  View: vi.fn(({ children, ...props }: any) => ({
    type: 'View',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
  ScrollView: vi.fn(({ children, ...props }: any) => ({
    type: 'ScrollView',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
}));

vi.mock('expo-haptics', () => ({
  notificationAsync: vi.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

vi.mock('@/components/BottomSheet', () => ({
  BottomSheet: vi.fn(({ children, ...props }: any) => ({
    type: 'BottomSheet',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
}));

vi.mock('@/lib/api', () => ({
  fetchCollections: vi.fn().mockResolvedValue({ items: [] }),
  createCollection: vi.fn().mockResolvedValue({
    id: 'new-1',
    name: 'Test',
    user_id: 'u1',
    is_public: false,
    position: 0,
    created_at: '',
    updated_at: '',
  }),
  moveBookmark: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/constants/theme', () => ({
  colors: {
    orange: '#E85D26',
    inkMuted: '#6B7280',
    inkFaint: '#9CA3AF',
  },
  fonts: {
    display: 'Lora_600SemiBold',
    body: 'DMSans_400Regular',
    bodyMed: 'DMSans_500Medium',
  },
}));

const SRC_PATH = resolve(__dirname, '../CollectionSheet.tsx');

describe('CollectionSheet', () => {
  it('exports CollectionSheet component', async () => {
    const mod = await import('../CollectionSheet');
    expect(mod.CollectionSheet).toBeDefined();
  });

  it('exports CollectionSheetRef interface', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('export interface CollectionSheetRef');
    expect(src).toContain('open');
    expect(src).toContain('close');
  });

  it('exports CollectionSheetProps interface', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('export interface CollectionSheetProps');
    expect(src).toContain('onMoved');
    expect(src).toContain('onCreated');
  });

  it('uses BottomSheet component', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('<BottomSheet');
    expect(src).toContain("from '@/components/BottomSheet'");
  });

  it('uses haptic feedback', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('Haptics.notificationAsync');
  });

  it('imports collection API functions', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('fetchCollections');
    expect(src).toContain('createCollection');
    expect(src).toContain('moveBookmark');
  });

  it('has create collection input and button', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('TextInput');
    expect(src).toContain('New collection name');
    expect(src).toContain('Create collection');
  });

  it('shows "Move to Collection" title when a recipe is active', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('Move to Collection');
  });

  it('renders collection list items with accessible labels', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain("accessibilityRole=\"button\"");
    expect(src).toContain('accessibilityLabel={col.name}');
  });

  it('is styled with NativeWind classes', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('className=');
    expect(src).toContain('bg-bgMuted');
    expect(src).toContain('bg-orange');
    expect(src).toContain('rounded-xl');
  });
});
