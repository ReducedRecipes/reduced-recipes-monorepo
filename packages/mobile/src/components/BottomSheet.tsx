import React, { useCallback, useMemo, forwardRef } from 'react';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetProps as GorhomProps,
} from '@gorhom/bottom-sheet';
import type { BottomSheetDefaultBackdropProps } from '@gorhom/bottom-sheet/lib/typescript/components/bottomSheetBackdrop/types';
import type { ReactNode } from 'react';

export interface BottomSheetProps {
  children: ReactNode;
  snapPoints?: (string | number)[];
  onClose?: () => void;
  enablePanDownToClose?: boolean;
  index?: number;
}

export const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(
  function BottomSheet(
    {
      children,
      snapPoints: snapPointsProp,
      onClose,
      enablePanDownToClose = true,
      index = -1,
    },
    ref,
  ) {
    const snapPoints = useMemo(
      () => snapPointsProp ?? ['25%', '50%', '90%'],
      [snapPointsProp],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetDefaultBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
        />
      ),
      [],
    );

    return (
      <GorhomBottomSheet
        ref={ref}
        index={index}
        snapPoints={snapPoints}
        enablePanDownToClose={enablePanDownToClose}
        onClose={onClose}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: '#9CA3AF', width: 40 }}
        backgroundStyle={{ backgroundColor: '#FAFAF8' }}
      >
        {children}
      </GorhomBottomSheet>
    );
  },
);
