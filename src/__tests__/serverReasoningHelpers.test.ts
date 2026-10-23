import { advanceSnapshot, extractToolCallsFromRaw } from '../services/tcp/streamHelpers'
import { buildCustomSettings } from '../services/tcp/settingsBuilder'

describe('advanceSnapshot', () => {
  it('returns the appended suffix of a growing snapshot', () => {
    expect(advanceSnapshot('Hello', 'Hello world')).toEqual({
      delta: ' world',
      snapshot: 'Hello world',
    })
  })

  it('returns nothing when the snapshot is unchanged', () => {
    expect(advanceSnapshot('Hello', 'Hello')).toEqual({ delta: '', snapshot: 'Hello' })
  })

  it('returns nothing for an empty snapshot', () => {
    expect(advanceSnapshot('Hello', '')).toEqual({ delta: '', snapshot: 'Hello' })
  })

  it('re-baselines when the parser rewinds so later text is not skipped', () => {
    expect(advanceSnapshot('Hello world', 'Hello')).toEqual({
      delta: '',
      snapshot: 'Hello',
    })
  })

  it('forwards only the tail that is newer than the previous snapshot', () => {
    expect(advanceSnapshot('ab', 'aXc')).toEqual({ delta: 'c', snapshot: 'aXc' })
  })
})

describe('extractToolCallsFromRaw', () => {
  const genId = () => 'call_test'

  it('keeps plain content untouched', () => {
    expect(extractToolCallsFromRaw('just text', genId)).toEqual({
      content: 'just text',
      toolCalls: [],
    })
  })

  it('extracts tool calls and removes them from content', () => {
    const raw = 'before<tool_call>{"name":"get_weather","arguments":{"city":"Paris"}}</tool_call>after'
    const { content, toolCalls } = extractToolCallsFromRaw(raw, genId)

    expect(content).toBe('beforeafter')
    expect(toolCalls).toEqual([
      {
        id: 'call_test',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
      },
    ])
  })

  it('drops incomplete tool calls', () => {
    expect(extractToolCallsFromRaw('answer<tool_call>{"name":', genId)).toEqual({
      content: 'answer',
      toolCalls: [],
    })
  })
})

describe('buildCustomSettings reasoning options', () => {
  it('forwards a valid reasoning format', () => {
    expect(buildCustomSettings({ reasoning_format: 'auto' })).toEqual({
      reasoning_format: 'auto',
    })
  })

  it('ignores an unknown reasoning format', () => {
    expect(buildCustomSettings({ reasoning_format: 'bogus' })).toBeUndefined()
  })

  it('forwards enable_thinking and chat_template_kwargs', () => {
    expect(buildCustomSettings({
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    })).toEqual({
      enable_thinking: false,
      chat_template_kwargs: { enable_thinking: false },
    })
  })
})
