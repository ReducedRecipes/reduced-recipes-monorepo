import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { Modal, View, Pressable, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  children: ReactNode;
  snapPoints?: (string | number)[];
  onClose?: () => void;
  enablePanDownToClose?: boolean;
  index?: number;
}

export interface BottomSheetRef {
  expand: () => void;
  close: () => void;
  snapToIndex: (index: number) => void;
}

export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  function BottomSheet({ children, onClose, index = -1 }, ref) {
    const [visible, setVisible] = useState(index >= 0);

    useImperativeHandle(ref, () => ({
      expand: () => setVisible(true),
      close: () => {
        setVisible(false);
        onClose?.();
      },
      snapToIndex: (i: number) => {
        if (i < 0) {
          setVisible(false);
          onClose?.();
        } else {
          setVisible(true);
        }
      },
    }));

    return (
      <Modal visible={visible} transparent animationType="slide">
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setVisible(false);
            onClose?.();
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          {children}
        </View>
      </Modal>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#F3F0EB',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: '#D4CFC8',
    paddingBottom: 34,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#9CA3AF',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
});
