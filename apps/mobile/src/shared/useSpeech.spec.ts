import { renderHook } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { useSpeech } from './useSpeech';

const mockSpeak = Speech.speak as jest.Mock;
const mockStop = Speech.stop as jest.Mock;

describe('useSpeech', () => {
  beforeEach(() => jest.clearAllMocks());

  it('habla con el locale BCP47 del idioma y rate 0.95, cancelando lo anterior', async () => {
    const { result } = await renderHook(() => useSpeech('pt-BR'));
    result.current.speak('bom dia');
    expect(mockStop).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledWith('bom dia', { language: 'pt-BR', rate: 0.95 });
  });

  it('mapea en → en-US y reporta supported', async () => {
    const { result } = await renderHook(() => useSpeech('en'));
    result.current.speak('hello');
    expect(mockSpeak).toHaveBeenCalledWith('hello', { language: 'en-US', rate: 0.95 });
    expect(result.current.supported).toBe(true);
  });
});
