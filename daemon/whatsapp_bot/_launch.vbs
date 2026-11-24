Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\PrintKurox\daemon\whatsapp_bot"
WshShell.Run "cmd /c ""C:\PrintKurox\daemon\whatsapp_bot\_run_student_bot.bat"" >> ""C:\PrintKurox\daemon\whatsapp_bot\student_bot_live.log"" 2>&1", 0, False
