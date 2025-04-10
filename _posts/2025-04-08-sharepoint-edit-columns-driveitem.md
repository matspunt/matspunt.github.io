---
layout: post
title:  "Editing columns of DriveItems in Sharepoint through Graph API"
categories: [ Coding ]
image: assets/images/laptop_bent.jpg
tags: [sticky]
---

Working with the Microsoft Graph API can be frustrating, as the documentation can be sparse at times. If you’ve found yourself needing to update columns (fields) in SharePoint for files inside the **Document Library**, this guide should help. I'll assume:
- You have basic knowledge of REST and the Graph API  
- You're authenticated to the Graph API or have a means of authentication (such as an Entra app registration)
- You have `Sites.ReadWrite.All` and `Lists.ReadWrite.All` permissions for your tenant in which the Sharepoint site resides
- You already have the `siteId` and `driveId` values for your SharePoint site: [Find site and drive IDs](https://www.daveherrell.com/sharepoint-find-site-id-and-drive-ids/)

---

### Accessing columns from `driveItem` directly doesn’t work
You might assume you can update columns with a direct endpoint like the following:
```bash
PATCH https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/root:/{path_to_file}/fields
```
Unfortunately, this does **not** work. As per the official documentation, the endpoint we should use to access item fields/columns is the following:
```bash
PATCH /sites/{site-id}/lists/{list-id}/items/{item-id}/fields
```
> [Microsoft Docs – Update listItem](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0&tabs=http)
---

### Understanding `itemId` vs `listItemId`
Even though files in a Document Library aren't in a traditional List, SharePoint treats Drives identically to Lists under the hood. This means that each file in the Sharepoint Drive has both an 1) itemId and 2) a listItemId. Whenever `list` occurs in the endpoint, we need to use the latter in our API calls to access the `listItem` endpoints. Often, the only way to understand the difference between these ID's is to look at their format:
- `itemId`: looks something like `01ADHJ88ULDNK9` (base64-style string)  
- `listItemId`: looks something like `22890` (integer)

Both refer to the *same file*, but are used in different parts of the API.

### Patching columns based on `itemId`
Obtaining `itemId` recursively can be done by travelling through the following endpoint:
```bash
GET https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/root:/{folder_name}:/children
```
where the resulting JSON response can be unpacked for `ItemId` through collecting the `['value']['file']['id']` values in the nested output. Or, alternatively, one can access `itemId` from the file path for a single file and use the following three Graph API calls to update the columns of a single file in a Sharepoint drive based on its location in the drive:
1. Obtaining `itemId` from the file path through a GET request
2. Obtaining `ListItemId` from the `ItemId` through another GET request. 
3. Patching the fields/columns based on the `ListItemId`. 

To begin with, you'll need the `ListId` of the Sharepoint drive. This can be retrieved by navigating to the Sharepoint drive, in top right 'Settings' > 'Library' > 'More library settings'. The page you'll be transported to, will contain the `ListId` inside the browser URL. The `ListId` is formatted similarly to `SiteId` and `DriveId` but will be different from those two. 
You'll need the following headers for each request. For the PATCH-request, an additional header is required:
```bash
    {
    'Authorization': 'Bearer {access_token}'
    }
```
#### 1. GET the `itemId` from the file path
If you already have a way of getting `itemId` for your files, then you can skip this call.
```bash
GET https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/root:/{path_to_file}
```
The response contains the key `['id']` → which is the `itemId`.
---
### 2. GET the `listItemId` through the `itemId`
```bash
GET https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/{item_id}/listItem
```
The following endpoint will give a response body as JSON where `listItemId` can be unpacked through keys `['fields']['id']`. Then, use this as input, together with a content body in the following endpoint to finally update the columns. 

### 3. PATCH the Fields
In addition to the Authorization header, you should also specify the `Content-Type` header:
```bash
    {
    'Authorization': 'Bearer {access_token}',
    'Content-Type': 'application/json'
    }
```
and give the body as:
```bash
{
  "ColumnName1": "New value",
  "ColumnName2": "Another value"
}
```
where the column names are case sensitive. The current suggested payload assumes the column data types are `Single line of text` but the [following link](https://martin-machacek.com/blogPost/6a3f765f-0b56-4245-aef7-39d0d3805ace) explains how to update different data types. Send the header and body to the endpoint below. Keep in mind that there are limitations in some of the column sizes. For instance, `Single line of text` can only accomodate 255 characters. The Graph API will not truncate this for you, and you need to catch these errors yourself. The right endpoint is:
```bash
PATCH https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/items/{list_item_id}/fields
```
You can investigate what the datatype of columns in your Document drive is, by performing a GET request on the endpoint:
```bash
GET https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/columns
```
where the output should be self-explanatory. Alternatively, here are a couple basic Python functions as potential building blocks for programmable changes to Sharepoint columns:
```python
import requests
import json

def get_access_token(tenant_id, client_id, client_secret):
    resource = "https://graph.microsoft.com/"
    base_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    body = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': resource + '.default'
    }
    response = requests.post(base_url, headers=headers, data=body)
    return response.json().get('access_token')

def get_item_id(site_id, drive_id, path_to_file, access_token):
    endpoint = f'https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/root:/{path_to_file}'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    response = requests.get(endpoint, headers=headers)
    if response.status_code not in [200, 201]:
        return None
    return json.loads(response.content)['id']

def get_list_item_id(site_id, item_id, access_token):
    endpoint = f'https://graph.microsoft.com/v1.0/sites/{site_id}/drive/items/{item_id}/listItem'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    response = requests.get(endpoint, headers=headers)
    if response.status_code not in [200, 201]:
        return None
    return json.loads(response.content)['fields']['id']

def patch_columns(site_id, list_id, list_item_id, access_token, columns_data=None):
    if columns_data is None:
        columns_data = {
            "ColumnName1": "New value",
            "ColumnName2": "Another value"
        }
    endpoint = f'https://graph.microsoft.com/v1.0/sites/{site_id}/lists/{list_id}/items/{list_item_id}/fields'
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json'
    }
    response = requests.patch(endpoint, headers=headers, json=columns_data)
    return response.status_code in [200, 201]
```

