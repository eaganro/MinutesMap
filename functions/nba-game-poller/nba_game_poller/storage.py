import gzip
import json
from decimal import Decimal

def upload_json_to_s3(*, s3_client, bucket, prefix, key, data, is_final=False):
    json_str = json.dumps(data)
    compressed = gzip.compress(json_str.encode("utf-8"))

    cache_control = (
        "public, max-age=604800"
        if is_final
        else "s-maxage=0, max-age=0, must-revalidate"
    )
    full_key = f"{prefix}{key}.gz"

    s3_client.put_object(
        Bucket=bucket,
        Key=full_key,
        Body=compressed,
        ContentType="application/json",
        ContentEncoding="gzip",
        CacheControl=cache_control,
    )
    print(f"Uploaded S3: {full_key}")


def update_manifest(*, s3_client, bucket, manifest_key, game_id):
    """Loads manifest.json from S3, adds game_id, uploads it back."""
    try:
        try:
            resp = s3_client.get_object(Bucket=bucket, Key=manifest_key)
            content = resp["Body"].read().decode("utf-8")
            manifest = set(json.loads(content))
        except Exception:
            manifest = set()

        if game_id in manifest:
            return

        manifest.add(game_id)
        s3_client.put_object(
            Bucket=bucket,
            Key=manifest_key,
            Body=json.dumps(list(manifest)),
            ContentType="application/json",
        )
        print(f"Manifest updated with {game_id}")
    except Exception as e:
        print(f"Manifest Error: {e}")

def upload_schedule_s3(*, s3_client, bucket, games_list, date_str, prefix="schedule/"):
    """
    Cleans, sorts, and uploads the daily schedule to S3.
    """
    # 1. Clean decimals from the source payload
    cleaned_games = convert_decimals(games_list)
    
    # 2. Sort by starttime
    cleaned_games.sort(key=lambda x: x.get('starttime', ''))

    # 3. Upload to schedule/{date}.json
    # We purposefully pass is_final=False to the storage helper because 
    # we want the cache to expire quickly (it's live data!)
    # However, your storage.py logic for is_final=False sets 's-maxage=0'.
    # That is good for live.
    
    upload_json_to_s3(
        s3_client=s3_client,
        bucket=bucket,
        prefix=prefix,  # Matches schedule/2026-01-05.json.gz
        key=f"{date_str}.json",
        data=cleaned_games,
        is_final=False,  # Forces volatile cache headers
    )

def convert_decimals(obj):
    """
    Recursively converts Decimal objects to int or float.
    """
    if isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    else:
        return obj
