const item = {
    job: "5600300950",
    item: "P113814018",
    description: "TC-3HR(BR)8.7X1200X100M",
    thickness: 8.7,
    width: 1200,
    length: 100,
    colorName: "Brown",
    materialType: "TC-3HR",
    finishedItem: "",
    itemMst: ""
};

const rawQuery = "5600300950";
const jobNo = item.job || item.Job || rawQuery;
const itemMst = (item.itemMst || item.ItemMst || item.finishedItem || item.FinishedItem || (item.item && !item.item.startsWith('P') ? item.item : '') || item.item || item.Item || '').trim();
const partNo = itemMst;
console.log("partNo:", partNo);
console.log("itemDescription:", item.description);

let materialNo = (item.item?.startsWith('P') ? item.item : '').trim();
let thickness = Number(item.thickness ?? item.Thickness ?? 0) || 9.0;
let width = Number(item.width ?? item.Width ?? 0) || 1200.0;
let length = Number(item.length ?? item.Length ?? 0) || 100.0;
console.log("Initial specs:", { thickness, width, length });

// BOM from server returns:
const foamMat = {
    materialItem: "P113814011",
    materialDescription: "TC-3HR(BR)",
    materialColor: "Brown",
    thickness: 0,
    width: 0,
    length: 0
};

materialNo = (foamMat.materialItem || materialNo).trim();
let materialDescription = (foamMat.materialDescription || '').trim();
thickness = Number(foamMat.thickness ?? thickness);
width = Number(foamMat.width ?? width);
length = Number(foamMat.length ?? length);
console.log("After BOM specs:", { materialNo, thickness, width, length });
