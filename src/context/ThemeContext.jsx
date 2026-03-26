import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => localStorage.getItem('xo_theme') || 'dark');
  const [colorScheme, setColorScheme] = useState(() => localStorage.getItem('xo_color') || 'pink');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('xo_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (colorScheme === 'navy') {
      document.documentElement.setAttribute('data-color', 'navy');
    } else {
      document.documentElement.removeAttribute('data-color');
    }
    localStorage.setItem('xo_color', colorScheme);
  }, [colorScheme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const toggleColorScheme = () => setColorScheme(prev => prev === 'pink' ? 'navy' : 'pink');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, colorScheme, toggleColorScheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext) || { theme: 'dark', toggleTheme: () => {}, colorScheme: 'pink', toggleColorScheme: () => {} };
