; INEX CLIENT — make sure a running launcher (or its backend) never blocks an install, update or uninstall.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM "INEX CLIENT.exe"'
  nsExec::Exec 'taskkill /F /IM "inex-node.exe"'
  Sleep 800
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM "INEX CLIENT.exe"'
  nsExec::Exec 'taskkill /F /IM "inex-node.exe"'
  Sleep 800
!macroend
