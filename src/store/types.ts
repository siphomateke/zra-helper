import { EolCharacter } from '@/backend/file_utils';

export interface RootState {
  zraLiteModeEnabled: boolean;
  /** End of line character to use in exports. */
  eol: EolCharacter | null;
  configIsLoading: boolean;
}
