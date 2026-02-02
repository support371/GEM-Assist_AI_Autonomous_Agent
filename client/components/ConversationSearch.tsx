import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, TextInput, Pressable, FlatList, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  FadeIn,
  FadeOut,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt?: string;
}

interface ConversationSearchProps {
  conversations: Conversation[];
  onSelect: (conversation: Conversation) => void;
  onClose: () => void;
}

export function ConversationSearch({ conversations, onSelect, onClose }: ConversationSearchProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  
  const filteredConversations = useMemo(() => {
    if (!query.trim()) return conversations;
    
    const lowerQuery = query.toLowerCase();
    return conversations.filter((conv) =>
      conv.title.toLowerCase().includes(lowerQuery)
    );
  }, [conversations, query]);

  const handleSelect = useCallback((conversation: Conversation) => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
    onSelect(conversation);
  }, [onSelect]);

  const handleClear = useCallback(() => {
    setQuery("");
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  const renderItem = useCallback(({ item }: { item: Conversation }) => (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <Pressable
        onPress={() => handleSelect(item)}
        style={({ pressed }) => [
          styles.resultItem,
          {
            backgroundColor: pressed ? theme.backgroundSecondary : theme.backgroundDefault,
            borderColor: theme.border,
          },
        ]}
      >
        <View style={[styles.resultIcon, { backgroundColor: theme.link + "20" }]}>
          <Feather name="message-circle" size={16} color={theme.link} />
        </View>
        <View style={styles.resultContent}>
          <ThemedText style={styles.resultTitle} numberOfLines={1}>
            {item.title}
          </ThemedText>
          <ThemedText style={[styles.resultDate, { color: theme.textTertiary }]}>
            {formatDate(item.updatedAt || item.createdAt)}
          </ThemedText>
        </View>
        <Feather name="chevron-right" size={18} color={theme.textTertiary} />
      </Pressable>
    </Animated.View>
  ), [theme, handleSelect]);

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <Feather name="search" size={40} color={theme.textTertiary} />
      <ThemedText style={[styles.emptyTitle, { color: theme.textSecondary }]}>
        {query ? "No conversations found" : "Search your conversations"}
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.textTertiary }]}>
        {query
          ? "Try a different search term"
          : "Type to find past conversations"}
      </ThemedText>
    </View>
  ), [query, theme]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.header}>
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
          ]}
        >
          <Feather name="search" size={18} color={theme.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search conversations..."
            placeholderTextColor={theme.textTertiary}
            value={query}
            onChangeText={setQuery}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Feather name="x-circle" size={18} color={theme.textTertiary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={onClose} style={styles.cancelButton}>
          <ThemedText style={[styles.cancelText, { color: theme.link }]}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      {query.length > 0 ? (
        <View style={[styles.resultsHeader, { borderBottomColor: theme.border }]}>
          <ThemedText style={[styles.resultsCount, { color: theme.textSecondary }]}>
            {filteredConversations.length} result{filteredConversations.length !== 1 ? "s" : ""}
          </ThemedText>
        </View>
      ) : null}

      <FlatList
        data={filteredConversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    height: 44,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  cancelButton: {
    padding: Spacing.sm,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  resultsHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  resultsCount: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing["3xl"],
    gap: Spacing.sm,
    flexGrow: 1,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  resultIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 2,
  },
  resultDate: {
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Spacing["5xl"],
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: Spacing.md,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
  },
});
