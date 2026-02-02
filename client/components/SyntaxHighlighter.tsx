import React, { useMemo } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Fonts, BorderRadius, Spacing } from "@/constants/theme";

interface SyntaxHighlighterProps {
  code: string;
  language: string;
}

const keywords: Record<string, string[]> = {
  javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "async", "await", "import", "export", "from", "default", "class", "extends", "new", "this", "try", "catch", "throw", "switch", "case", "break", "continue", "typeof", "instanceof", "null", "undefined", "true", "false"],
  typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "async", "await", "import", "export", "from", "default", "class", "extends", "new", "this", "try", "catch", "throw", "interface", "type", "enum", "implements", "public", "private", "protected", "readonly", "static", "abstract", "as", "is", "keyof", "typeof", "instanceof", "null", "undefined", "true", "false"],
  python: ["def", "class", "return", "if", "elif", "else", "for", "while", "import", "from", "as", "try", "except", "raise", "with", "lambda", "yield", "pass", "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False", "self", "async", "await"],
  html: ["html", "head", "body", "div", "span", "p", "a", "img", "ul", "ol", "li", "table", "tr", "td", "th", "form", "input", "button", "script", "style", "link", "meta", "title", "header", "footer", "nav", "main", "section", "article", "aside"],
  css: ["color", "background", "margin", "padding", "border", "width", "height", "display", "flex", "grid", "position", "top", "left", "right", "bottom", "font", "text", "align", "justify", "transform", "transition", "animation", "opacity", "z-index", "overflow", "cursor", "hover", "active", "focus"],
  sql: ["SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "TABLE", "INDEX", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON", "AND", "OR", "NOT", "IN", "LIKE", "ORDER", "BY", "GROUP", "HAVING", "LIMIT", "OFFSET", "NULL", "TRUE", "FALSE", "AS"],
};

const builtins: Record<string, string[]> = {
  javascript: ["console", "document", "window", "Array", "Object", "String", "Number", "Boolean", "Date", "Math", "JSON", "Promise", "Map", "Set", "fetch", "setTimeout", "setInterval"],
  typescript: ["console", "document", "window", "Array", "Object", "String", "Number", "Boolean", "Date", "Math", "JSON", "Promise", "Map", "Set", "fetch", "setTimeout", "setInterval", "React", "useState", "useEffect", "useCallback", "useMemo", "useRef"],
  python: ["print", "len", "range", "str", "int", "float", "list", "dict", "set", "tuple", "open", "input", "sorted", "map", "filter", "zip", "enumerate", "type", "isinstance", "hasattr", "getattr", "setattr"],
};

interface Token {
  type: "keyword" | "string" | "comment" | "number" | "builtin" | "tag" | "attr" | "text" | "operator" | "punctuation";
  value: string;
}

function tokenize(code: string, language: string): Token[] {
  const tokens: Token[] = [];
  const lang = language.toLowerCase();
  const langKeywords = keywords[lang] || keywords.javascript || [];
  const langBuiltins = builtins[lang] || [];
  
  const lines = code.split("\n");
  
  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      tokens.push({ type: "text", value: "\n" });
    }
    
    let i = 0;
    while (i < line.length) {
      const remaining = line.slice(i);
      
      if (remaining.startsWith("//") || remaining.startsWith("#")) {
        tokens.push({ type: "comment", value: remaining });
        break;
      }
      
      const stringMatch = remaining.match(/^(["'`])(?:[^\\]|\\.)*?\1/);
      if (stringMatch) {
        tokens.push({ type: "string", value: stringMatch[0] });
        i += stringMatch[0].length;
        continue;
      }
      
      const numberMatch = remaining.match(/^-?\d+\.?\d*/);
      if (numberMatch) {
        tokens.push({ type: "number", value: numberMatch[0] });
        i += numberMatch[0].length;
        continue;
      }
      
      if (lang === "html" || lang === "jsx" || lang === "tsx") {
        const tagMatch = remaining.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
        if (tagMatch) {
          tokens.push({ type: "punctuation", value: tagMatch[0].startsWith("</") ? "</" : "<" });
          tokens.push({ type: "tag", value: tagMatch[1] });
          i += tagMatch[0].length;
          continue;
        }
        
        const attrMatch = remaining.match(/^([a-zA-Z][a-zA-Z0-9-]*)=/);
        if (attrMatch) {
          tokens.push({ type: "attr", value: attrMatch[1] });
          tokens.push({ type: "operator", value: "=" });
          i += attrMatch[0].length;
          continue;
        }
      }
      
      const wordMatch = remaining.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
      if (wordMatch) {
        const word = wordMatch[0];
        if (langKeywords.includes(word)) {
          tokens.push({ type: "keyword", value: word });
        } else if (langBuiltins.includes(word)) {
          tokens.push({ type: "builtin", value: word });
        } else {
          tokens.push({ type: "text", value: word });
        }
        i += word.length;
        continue;
      }
      
      const operatorMatch = remaining.match(/^[=<>!+\-*/%&|^~?:]+/);
      if (operatorMatch) {
        tokens.push({ type: "operator", value: operatorMatch[0] });
        i += operatorMatch[0].length;
        continue;
      }
      
      const punctMatch = remaining.match(/^[{}[\]();,.]/);
      if (punctMatch) {
        tokens.push({ type: "punctuation", value: punctMatch[0] });
        i += 1;
        continue;
      }
      
      tokens.push({ type: "text", value: line[i] });
      i++;
    }
  });
  
  return tokens;
}

export function SyntaxHighlighter({ code, language }: SyntaxHighlighterProps) {
  const { theme, isDark } = useTheme();
  
  const colors = useMemo(() => ({
    keyword: isDark ? "#C792EA" : "#7C3AED",
    string: isDark ? "#C3E88D" : "#16A34A",
    comment: isDark ? "#546E7A" : "#6B7280",
    number: isDark ? "#F78C6C" : "#EA580C",
    builtin: isDark ? "#82AAFF" : "#2563EB",
    tag: isDark ? "#F07178" : "#DC2626",
    attr: isDark ? "#FFCB6B" : "#CA8A04",
    operator: isDark ? "#89DDFF" : "#0EA5E9",
    punctuation: isDark ? "#89DDFF" : "#64748B",
    text: theme.codeText,
  }), [isDark, theme.codeText]);
  
  const tokens = useMemo(() => tokenize(code, language), [code, language]);
  
  return (
    <View style={styles.container}>
      <ThemedText style={[styles.code, { fontFamily: Fonts?.mono || "monospace" }]}>
        {tokens.map((token, index) => (
          <ThemedText
            key={index}
            style={[
              styles.token,
              { color: colors[token.type] || colors.text, fontFamily: Fonts?.mono || "monospace" },
            ]}
          >
            {token.value}
          </ThemedText>
        ))}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
  },
  code: {
    fontSize: 13,
    lineHeight: 20,
  },
  token: {
    fontSize: 13,
    lineHeight: 20,
  },
});
