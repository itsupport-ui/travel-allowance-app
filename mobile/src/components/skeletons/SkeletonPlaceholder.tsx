import {
  Children,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface SkeletonContextValue {
  backgroundColor: string;
  borderRadius: number;
}

interface SkeletonPlaceholderProps {
  backgroundColor?: string;
  borderRadius?: number;
  children: ReactElement;
  enabled?: boolean;
  highlightColor?: string;
  speed?: number;
}

type SkeletonItemProps = ViewStyle & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const SkeletonContext = createContext<SkeletonContextValue>({
  backgroundColor: "#E1E9EE",
  borderRadius: 4,
});

const SkeletonItem = ({
  children,
  style,
  ...viewStyle
}: SkeletonItemProps) => {
  const context = useContext(SkeletonContext);
  const isLeaf = Children.count(children) === 0;

  return (
    <View
      style={[
        style,
        viewStyle,
        isLeaf
          ? {
              backgroundColor: context.backgroundColor,
              borderRadius:
                viewStyle.borderRadius ?? context.borderRadius,
            }
          : null,
      ]}
    >
      {children}
    </View>
  );
};

SkeletonItem.displayName = "SkeletonPlaceholderItem";

const SkeletonPlaceholder = ({
  backgroundColor = "#E1E9EE",
  borderRadius = 4,
  children,
  enabled = true,
  speed = 900,
}: SkeletonPlaceholderProps) => {
  const opacity = useRef(new Animated.Value(0.55)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setReduceMotion(enabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!enabled || reduceMotion || speed <= 0) {
      opacity.setValue(0.72);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          duration: speed,
          easing: Easing.inOut(Easing.ease),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          duration: speed,
          easing: Easing.inOut(Easing.ease),
          toValue: 0.55,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [enabled, opacity, reduceMotion, speed]);

  if (!enabled) {
    return children;
  }

  return (
    <SkeletonContext.Provider
      value={{
        backgroundColor,
        borderRadius,
      }}
    >
      <Animated.View style={{ opacity }}>{children}</Animated.View>
    </SkeletonContext.Provider>
  );
};

SkeletonPlaceholder.Item = SkeletonItem;

export default SkeletonPlaceholder as typeof SkeletonPlaceholder & {
  Item: typeof SkeletonItem;
};
