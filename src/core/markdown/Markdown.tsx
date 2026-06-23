import React, { useRef, useState, useMemo, useCallback } from 'react'
import { Text } from 'react-native'
import MarkdownDisplay from 'react-native-markdown-display'
import CodePreview from '../../components/CodePreview'
import type { MarkdownColors } from './types'

interface Props {
  value: string
  colors: MarkdownColors
  fontSize?: number
}

const MemoCodeBlock = React.memo(
  ({ code, lang, onHeight }: { code: string; lang?: string; onHeight: (key: string, h: number) => void }) => {
    const key = code.slice(0, 40)
    const [h, setH] = useState(0)
    return (
      <CodePreview
        code={code}
        language={lang || 'html'}
        style={{ width: '100%', height: h || Math.min(code.split('\n').length * 20 + 40, 500), minHeight: 80 }}
        onHeightChange={(height) => { setH(height); onHeight(key, height) }}
      />
    )
  },
  (prev, next) => prev.code === next.code,
)

export default function Markdown({ value, colors, fontSize = 15 }: Props) {
  if (!value) return null
  const [, forceUpdate] = useState(0)
  const heightCache = useRef<Record<string, number>>({})

  const onCodeHeight = useCallback((key: string, h: number) => {
    if (heightCache.current[key] !== h) {
      heightCache.current[key] = h
      forceUpdate(n => n + 1)
    }
  }, [])

  const style = {
    body: { color: colors.text, fontSize, lineHeight: 22 },
    heading1: { fontSize: 24, fontWeight: '700' as const, color: colors.text, marginVertical: 8 },
    heading2: { fontSize: 20, fontWeight: '700' as const, color: colors.text, marginVertical: 6 },
    heading3: { fontSize: 18, fontWeight: '600' as const, color: colors.text, marginVertical: 4 },
    heading4: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
    heading5: { fontSize: 15, fontWeight: '600' as const, color: colors.text },
    heading6: { fontSize: 15, fontWeight: '500' as const, color: colors.text },
    strong: { fontWeight: '700' as const },
    em: { fontStyle: 'italic' as const },
    s: { textDecorationLine: 'line-through' as const },
    code_inline: {
      fontFamily: 'monospace' as const,
      fontSize: fontSize - 1,
      backgroundColor: colors.surface,
      color: colors.primary,
      paddingHorizontal: 4,
      borderRadius: 3,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.border,
      paddingLeft: 10,
      opacity: 0.8,
      marginVertical: 4,
    },
    link: { color: colors.primary, textDecorationLine: 'underline' as const },
    list_item: { marginVertical: 2 },
    ordered_list_icon: { color: colors.text },
    bullet_list_icon: { color: colors.text },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 8 },
    table: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginVertical: 4 },
    thead: { backgroundColor: colors.surface },
    th: { padding: 8, color: colors.text, fontWeight: '600' as const },
    tr: { borderBottomWidth: 1, borderColor: colors.border },
    td: { padding: 8, fontSize: fontSize - 1, color: colors.text },
    image: { width: 240, height: 200, borderRadius: 8, marginVertical: 4 },
  }

  const rules = useMemo(() => ({
    code_block: (node: any) => (
      <MemoCodeBlock code={node.content} lang={node.sourceInfo || ''} onHeight={onCodeHeight} />
    ),
    fence: (node: any) => (
      <MemoCodeBlock code={node.content} lang={node.sourceInfo || ''} onHeight={onCodeHeight} />
    ),
    text: (node: any) => <Text key={node.key} style={{ color: colors.text, fontSize }}>{node.content}</Text>,
  }), [onCodeHeight, colors])

  return (
    <MarkdownDisplay style={style} rules={rules}>
      {value}
    </MarkdownDisplay>
  )
}
