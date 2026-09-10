@echo off
chcp 65001 > nul
title Void Editor - CEP Debug Mode Kayit Dosyasi

echo ============================================================
echo   Void Editor - Adobe CEP Debug Mode Etkinlestiriliyor...
echo ============================================================
echo.

:: CSXS 10 (Premiere Pro 2020-2021)
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d "1" /f > nul

:: CSXS 11 (Premiere Pro 2022-2023)
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d "1" /f > nul

:: CSXS 12 (Premiere Pro 2024+)
reg add "HKEY_CURRENT_USER\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d "1" /f > nul

echo [OK] Kayit Defteri ayarlar basariyla eklendi!
echo [OK] PlayerDebugMode = 1 yapildi.
echo.
echo Premiere Pro'yu yeniden baslatarak eklentiyi kullanabilirsiniz.
echo.
pause