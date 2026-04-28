#!/bin/bash
# Backfill ingredient index via admin endpoint
TOKEN="backfill-temp-f0626ff78335941ff260c9126b919964"
API="https://reducedrecipes.com/api/v1/admin/backfill-ingredients"
TOTAL=0
BATCH=0
CURSOR_ARG=""

while true; do
  BATCH=$((BATCH + 1))

  if [ -z "$CURSOR_ARG" ]; then
    BODY='{"batch_size":100}'
  else
    BODY="{\"batch_size\":100,\"cursor\":\"$CURSOR_ARG\"}"
  fi

  RESULT=$(curl -s -X POST "$API" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$BODY" --max-time 120)

  # Parse response
  PROCESSED=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('processed',0))" 2>/dev/null || echo 0)
  DONE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('done',False))" 2>/dev/null || echo False)
  CURSOR_ARG=$(echo "$RESULT" | python3 -c "import sys,json; c=json.load(sys.stdin).get('next_cursor',''); print(c if c else '')" 2>/dev/null || echo "")

  TOTAL=$((TOTAL + PROCESSED))
  echo "Batch $BATCH: +$PROCESSED (total: $TOTAL) done=$DONE"

  if [ "$DONE" = "True" ] || [ "$DONE" = "true" ] || [ -z "$CURSOR_ARG" ]; then
    echo "===== Backfill complete! Total: $TOTAL ====="
    break
  fi
done
