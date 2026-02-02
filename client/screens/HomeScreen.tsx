import React, { useState, useCallback, useEffect } from "react";
import { View, FlatList, StyleSheet, Pressable, RefreshControl, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { ConversationItem } from "@/components/ConversationItem";
import { EmptyState } from "@/components/EmptyState";
import { ConversationSearch } from "@/components/ConversationSearch";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Gradients } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import type { Conversation } from "@/types/chat";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Main">;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const fabScale = useSharedValue(1);

  const fetchConversations = async () => {
    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/conversations`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
      }
    } catch (error) {
      console.error("Error fetching conversations:", error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const handleNewChat = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    try {
      const baseUrl = getApiUrl();
      const response = await fetch(`${baseUrl}api/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });

      if (response.ok) {
        const conversation = await response.json();
        navigation.navigate("Chat", { conversationId: conversation.id });
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const handleDeleteConversation = async (id: number) => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }

    try {
      const baseUrl = getApiUrl();
      await fetch(`${baseUrl}api/conversations/${id}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
  }));

  const handleFabPressIn = () => {
    fabScale.value = withSpring(0.9);
  };

  const handleFabPressOut = () => {
    fabScale.value = withSpring(1);
  };

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <Animated.View entering={FadeIn.delay(100)} exiting={FadeOut}>
        <ConversationItem
          conversation={item}
          onPress={() => navigation.navigate("Chat", { conversationId: item.id })}
          onDelete={() => handleDeleteConversation(item.id)}
        />
      </Animated.View>
    ),
    [navigation]
  );

  const handleSearchSelect = (conversation: Conversation) => {
    setShowSearch(false);
    navigation.navigate("Chat", { conversationId: conversation.id });
  };

  const renderHeader = () => (
    <View style={styles.headerSection}>
      <View style={styles.headerRow}>
        <View>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Recent Chats
          </ThemedText>
          <ThemedText style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
            {conversations.length > 0
              ? `${conversations.length} conversation${conversations.length > 1 ? "s" : ""}`
              : "Start a new conversation to begin"}
          </ThemedText>
        </View>
        {conversations.length > 0 ? (
          <Pressable
            onPress={() => setShowSearch(true)}
            style={[styles.searchButton, { backgroundColor: theme.backgroundSecondary }]}
          >
            <Feather name="search" size={20} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  if (showSearch) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, paddingTop: headerHeight }]}>
        <ConversationSearch
          conversations={conversations}
          onSelect={handleSearchSelect}
          onClose={() => setShowSearch(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + 100,
          },
        ]}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyContainer}>
              <EmptyState type="history" />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.link}
            progressViewOffset={headerHeight}
          />
        }
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      />

      <AnimatedPressable
        onPress={handleNewChat}
        onPressIn={handleFabPressIn}
        onPressOut={handleFabPressOut}
        style={[
          styles.fab,
          fabAnimatedStyle,
          { bottom: tabBarHeight + Spacing.lg },
        ]}
      >
        <LinearGradient
          colors={Gradients.primary as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </LinearGradient>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  headerSection: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    marginTop: Spacing["5xl"],
  },
  fab: {
    position: "absolute",
    right: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabGradient: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
  },
});
