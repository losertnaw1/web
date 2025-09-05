import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useI18n, Language } from '../i18n/i18n';

const LanguageSwitch: React.FC = () => {
  const { lang, setLang } = useI18n();

  const handleChange = (_: any, value: Language | null) => {
    if (value) setLang(value);
  };

  return (
    <ToggleButtonGroup
      size="small"
      value={lang}
      exclusive
      onChange={handleChange}
      color="secondary"
      aria-label="language switch"
      sx={{ mr: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 }}
    >
      <ToggleButton value="vi" aria-label="Vietnamese">VI</ToggleButton>
      <ToggleButton value="en" aria-label="English">EN</ToggleButton>
    </ToggleButtonGroup>
  );
};

export default LanguageSwitch;

