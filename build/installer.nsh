; INEX CLIENT — custom NSIS hooks (picked up automatically by electron-builder from build/installer.nsh)
; Makes sure a running launcher never blocks (or survives) an install, update or uninstall.

!macro customInit
  nsExec::Exec 'taskkill /F /IM "INEX CLIENT.exe"'
  Sleep 800
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /F /IM "INEX CLIENT.exe"'
  Sleep 800
!macroend
