
$apiProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps/api; ./venv/Scripts/activate; uvicorn main:app --reload --host 0.0.0.0 --port 8000" -PassThru
$webProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps/web; npm run dev" -PassThru

Write-Host "Started API (PID: $($apiProcess.Id)) and Web (PID: $($webProcess.Id))"
