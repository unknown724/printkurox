Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Richard Konsam\Desktop\DEVANANDA\autoprint\daemon"
WshShell.Run "python -u printer_daemon.py", 0, False
