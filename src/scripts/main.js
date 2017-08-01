const app = new cot_app("Graffiti Exemption");
const form_id = "graffiti_exemption";
const configURL = "//www1.toronto.ca/static_files/WebApps/CommonComponents/graffiti_exemption/JSONFeed.js";
let repo = "graffiti_exemption";

let form, config, httpHost, mailSend;
let docDropzone, imageDropzone;
let cookie_SID = form_id + ".sid";

$(document).ready(function () {
  app.render(function () {
    initialize();
  });
  function initialize() {
    loadVariables();
  }
  function loadVariables() {
    // Loads the config parameters from the defined config URL file  
    $.ajax({
      url: configURL,
      type: "GET",
      cache: "true",
      dataType: "jsonp",
      jsonpCallback: "callback",
      success: function (data) {
        $.each(data.items, function (i, item) { app.data[item.title] = item.summary; });
        config = app.data.config;
        renderApp();
      },
      error: function () {
        alert("Error: The application was unable to load data.")
      }
    })
  }
  function renderApp() {
    // Renders the application
    repo = config.default_repo ? config.default_repo : repo;
    mailSend = config.messages.notify.sendNotification ? config.messages.notify.sendNotification : false;
    httpHost = detectHost();
    loadForm();
    app.setBreadcrumb(app.data['breadcrumbtrail']);
    app.addForm(form, 'top');

    // Attachment fields are defined
    docDropzone = new Dropzone("div#document_dropzone", $.extend(config.admin.docDropzonePublic, {
      "dz_id": "document_dropzone", "fid": "", "form_id": form_id,
      "url": config.api_public.upload + config.default_repo + '/' + repo
    }));
    imageDropzone = new Dropzone("div#image_dropzone", $.extend(config.admin.imageDropzonePublic, {
      "dz_id": "image_dropzone", "fid": "", "form_id": form_id,
      "url": config.api_public.upload + config.default_repo + '/' + repo,
      "init": function () {
        // Adding extra validation to imageDropzone field by using txtPicName field
        // Min 1 file needs to be uploaded
        let attFieldname = "txtPicName";
        this
          .on("addedfile", function (file) { validateUpload("addedfile", attFieldname, file.name); })
          .on("success", function (file) { validateUpload("success", attFieldname, file.name); })
          .on("removedfile", function () { validateUpload("removedFile", attFieldname, ""); })
          .on("error", function () { validateUpload("error", attFieldname, ""); });
      }
    }));
    initForm();
  }
  function detectHost() {
    // Detects the host type dev/qa/prod based on the url
    switch (window.location.origin) {
      case config.httpHost.root_public.dev:
        return 'dev';
      case config.httpHost.root_public.qa:
        return 'qa';
      case config.httpHost.root_public.prod:
        return 'prod';
      default:
        console.log("Cannot find the server parameter in detectHost function. Please check with your administrator.");
        return 'dev';
    }
  }
  function loadForm() {
    // Loads form sections/fields
    form = new CotForm({
      id: form_id,
      title: app.data["Form Title"],
      useBinding: false,
      rootPath: config.httpHost.rootPath_public[httpHost],
      sections: getSubmissionSections(),
      success: function () {
      }
    });
  }

});
function initForm() {
  var dataCreated = new Date();
  //dataCreated = moment(dataCreated).format(config.dateTimeFormat);
  $("#recCreated").val(dataCreated);
  $("#lsteStatus").val(config.status.DraftApp);
  $("#closebtn").click(function () { window.close(); });
  $("#printbtn").click(function () { window.print(); });
  $("#setbtn").click(function () { setAddressSame(); });
  $('input[name="eNotice"]').on('change',
    function () {
      var checkVal = $('input[name="eNotice"]:checked').val();
      (checkVal == "Yes") ? $("#ComplianceDateElement .optional").first().text("") : $("#ComplianceDateElement .optional").first().text("(optional)");
      $('#' + form_id).formValidation('revalidateField', $('#ComplianceDate'));
    });
  $('input[name="eMaintenance"]').on('change',
    function () {
      var checkVal = $('input[name="eMaintenance"]:checked').val();
      (checkVal == "Yes") ? $("#eMaintenanceAgreementElement .optional").first().text("") : $("#eMaintenanceAgreementElement .optional").first().text("(optional)");
      $('#' + form_id).formValidation('revalidateField', $('#eMaintenanceAgreement'));
    });

  $(".dz-hidden-input").attr("aria-hidden", "true");
  $(".dz-hidden-input").attr("aria-label", "File Upload Control");

  // manual fix for "optional" parameter on label for relaed fields
  $("#ePermissionElement .optional").first().text("");
  $("#eNoticeElement .optional").first().text("");
  $("#eMaintenanceElement .optional").first().text("");
  $("#eArtistInfoElement .optional").first().text("");
  $("#eArtSurfaceEnhanceElement .optional").first().text("");
  $("#eArtLocalCharacterElement .optional").first().text("");

  $('#' + form_id).data('formValidation').addField('txtPicName', { excluded: false, validators: { notEmpty: { message: app.data["imageValidation"] } } })
  $("#makePDFbtn").click(function () { makePDF(); })

  $("#savebtn").click(function () {
    let form_fv = $('#' + form_id).data('formValidation');
    form_fv.validate();
    // Call submitForm function to submit form if it passes validation
    if (form_fv.isValid()) {
      submitForm()
    }
  });
}
function setAddressSame() {
  $("#emAddress").val($("#eAddress").val());
  $("#emCity").val($("#eCity").val());
  $("#emPostalCode").val($("#ePostalCode").val());
  $("#emPrimaryPhone").val($("#ePrimaryPhone").val());
}
function submitForm() {
  setGeoParams();
  let payload = form.getData();
  // Gets all the info for uploads to payroll
  payload.doc_uploads = processUploads(docDropzone, repo, false);
  payload.image_uploads = processUploads(imageDropzone, repo, false);

  let uploads = (payload.image_uploads).concat(payload.doc_uploads);
  let keepQueryString = checkFileUploads(uploads);
  // console.log('-----------keepQueryString----', keepQueryString);

  $.ajax({
    url: config.httpHost.app_public[httpHost] + config.api_public.post + repo + '?sid=' + getCookie(cookie_SID) + keepQueryString,
    type: 'POST',
    data: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json; charset=utf-8;',
      'Cache-Control': 'no-cache'
    },
    dataType: 'json',
    success: function (data) {
      if ((data.EventMessageResponse.Response.StatusCode) == 200) {
        $('#app-content-top').html(config.messages.submit.done);
        // $('#app-content-bottom').html(app.data["Success Message"]);

        if (mailSend) {
          // Email report notice to configured staff
          emailNotice(data.EventMessageResponse.Event.EventID, 'notify');
        }
      }
    },
    error: function () {
      $('#successFailArea').html(config.messages.submit.fail);
    }
  }).done(function (data, textStatus, jqXHR) {
    //  if (data && data.EventMessageResponse && data.EventMessageResponse.Event && data.EventMessageResponse.Event.EventID) { }
  });

}
function emailNotice(fid, action) {
  let emailTo = {};
  let emailCaptain = config.captain_emails;
  let emailAdmin = config.admin_emails;
  (typeof emailCaptain !== 'undefined' && emailCaptain != '') ? $.extend(emailTo, emailCaptain) : '';
  (typeof emailAdmin !== 'undefined' && emailAdmin != '') ? $.extend(emailTo, emailAdmin) : '';

  var emailRecipients = $.map(emailTo, function (email) {
    return email;
  }).filter(function (itm, i, a) {
    return i === a.indexOf(itm);
  }).join(',');

  var payload = JSON.stringify({
    'emailTo': emailRecipients,
    'emailFrom': (config.messages.notify.emailFrom ? config.messages.notify.emailFrom : 'wmDev@toronto.ca'),
    'id': fid,
    'status': action,
    'body': (config.messages.notify.emailBody ? config.messages.notify.emailBody : 'New submission has been received.'),
    'emailSubject': (config.messages.notify.emailSubject ? config.messages.notify.emailSubject : 'New submission')
  });

  $.ajax({
    url: config.httpHost.app_public[httpHost] + config.api_public.email,
    type: 'POST',
    data: payload,
    headers: {
      'Content-Type': 'application/json; charset=utf-8;',
      'Cache-Control': 'no-cache'
    },
    dataType: 'json'
  }).done(function (data, textStatus, jqXHR) {
    if (action === 'notify') {
      //  hasher.setHash(fid + '?alert=success&msg=notify.done&ts=' + new Date().getTime());
    }
  }).fail(function (jqXHR, textStatus, error) {
    console.log("POST Request Failed: " + textStatus + ", " + error);
    if (action === 'notify') {
      //  hasher.setHash(fid + '?alert=danger&msg=notify.fail&ts=' + new Date().getTime());
    }
  });
}
function processUploads(DZ, repo, sync) {
  let uploadFiles = DZ.existingUploads ? DZ.existingUploads : new Array;
  let _files = DZ.getFilesWithStatus(Dropzone.SUCCESS);
  let syncFiles = sync;
  if (_files.length == 0) {
    //empty
  } else {
    $.each(_files, function (i, row) {
      let json = JSON.parse(row.xhr.response);
      json.name = row.name;
      json.type = row.type;
      json.size = row.size;
      json.bin_id = json.BIN_ID[0];
      delete json.BIN_ID;
      uploadFiles.push(json);
      syncFiles ? '' : '';
    });
  }
  return uploadFiles;
}
function validateUpload(event, field, value) {
  //placeholder for additional logic based on the event
  switch (event) {
    case "addedfile":
      break;
    case "success":
      break;
    case "removedfile":
      break;
    case "error":
      console.log("custom error code")
      $('#' + form_id).data('formValidation').updateMessage(field, 'notEmpty', app.data.uploadServerErrorMessage)
      break;
    default:
  }
  $('#' + field).val(value);
  $('#' + form_id).data('formValidation').revalidateField(field);
}
function getSubmissionSections() {

  let section = [
    {
      id: "contactSec",
      title: app.data["Contact Details Section"],
      className: "panel-info",
      rows: [
        // for testing purposes
        /*
        {fields: [
          {
            id: "actionBar",
            type: "html",
            html: `<div className="col-xs-12 col-md-12"><button class="btn btn-success" id="savebtntemp"><span class="glyphicon glyphicon-send" aria-hidden="true"></span> ` + config.button.submitReport + `</button>
                 <button class="btn btn-success" id="printbtn"><span class="glyphicon glyphicon-print" aria-hidden="true"></span>Print</button>
                  <button class="btn btn-info" id="makePDFbtn"><span class="glyphicon glyphicon-print" aria-hidden="true"></span>Print PDF</button></div>`
          }]},*/
        {
          fields: [
            { id: "eFirstName", title: app.data["First Name"], className: "col-xs-12 col-md-6", required: true },
            { id: "eLastName", title: app.data["Last Name"], className: "col-xs-12 col-md-6", required: true },
            { id: "eAddress", title: app.data["Address"], className: "col-xs-12 col-md-6", required: true },
            { id: "eCity", title: app.data["City"], value: "Toronto", className: "col-xs-12 col-md-6" }
          ]
        },
        {
          fields: [
            { id: "ePostalCode", title: app.data["Postal Code"], validationtype: "PostalCode", className: "col-xs-12 col-md-6" },
            { id: "ePrimaryPhone", title: app.data["Phone"], validationtype: "Phone", className: "col-xs-12 col-md-6", required: true },
            { id: "eFax", title: app.data["Fax"], validationtype: "Phone", className: "col-xs-12 col-md-6" },
            { id: "eEmail", title: app.data["Email"], validationtype: "Email", validators: { regexp: { regexp: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/, message: 'This field must be a valid email. (###@###.####)' } }, className: "col-xs-12 col-md-6" }
          ]
        }
      ]
    },
    {
      id: "graffitiSec",
      title: app.data["Graffiti Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            { id: "emSameAddress", title: "", type: "html", html: `<div className="col-xs-12 col-md-12"><button class="btn btn-info" id="setbtn"><span class="" aria-hidden="true"></span> ` + app.data["Same As Above"] + `</button></div>` }
          ]
        },
        {
          fields: [
            { id: "emAddress", title: app.data["Address"], className: "col-xs-12 col-md-6", required: true },
            { id: "emCity", title: app.data["City"], value: "Toronto", className: "col-xs-12 col-md-6" }
          ]
        },
        {
          fields: [
            { id: "emPostalCode", title: app.data["Postal Code"], className: "col-xs-12 col-md-6" },
            { id: "emPrimaryPhone", title: app.data["Phone"], validationtype: "Phone", className: "col-xs-12 col-md-6" },
            { id: "emFacingStreet", title: app.data["Facing Street"], className: "col-xs-12 col-md-6", required: true },
            { id: "emDescriptiveLocation", "posthelptext": app.data["DescriptiveLocationText"], title: app.data["graffitiDesLocation"], className: "col-xs-12 col-md-6", "required": true }
          ]
        }
      ]
    },
    {
      id: "detailsSec",
      title: app.data["Details Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            {
              id: "ePermission", title: app.data["permission"], type: "radio", className: "col-xs-12 col-md-6", "choices": config.choices.yesNoFull, "orientation": "horizontal",
              validators: {
                callback: {
                  message: app.data["permissionValidation"],
                  callback: function (value, validator, $field) {
                    return ($field[0].checked);
                  }
                }
              }
            }]
        },
        {
          fields: [
            {
              id: "eNotice", title: app.data["notice"], type: "radio", className: "col-xs-12 col-md-6", "choices": config.choices.yesNoFull, "orientation": "horizontal",
              validators: {
                callback: {
                  message: app.data["noticeValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            }, {
              id: "ComplianceDate", title: app.data["compliance"], type: "datetimepicker", "placeholder": config.dateFormat, className: "col-xs-12 col-md-6", "options": { format: config.dateFormat },
              validators: {
                callback: {
                  message: app.data["complianceValidation"],
                  // this is added to formValidation
                  callback: function (value, validator, $field) {
                    var checkVal = $('input[name="eNotice"]:checked').val();
                    return ((checkVal !== "Yes") ? true : (value !== ''));
                  }
                }
              }
            }]
        },
        {
          fields: [
            {
              id: "eMaintenance", title: app.data["maintenance"], type: "radio", className: "col-xs-12 col-md-6", "choices": config.choices.yesNoFull, "orientation": "horizontal",
              validators: {
                callback: {
                  message: app.data["maintenanceValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            {
              id: "eMaintenanceAgreement", title: app.data["agreementDetails"], className: "col-xs-12 col-md-12",
              validators: {
                callback: {
                  message: app.data["agreementDetailsValidation"],
                  callback: function (value, validator, $field) {
                    var checkVal = $('input[name="eMaintenance"]:checked').val();
                    return ((checkVal !== "Yes") ? true : (value !== ''));
                  }
                }
              }
            },
            {
              id: "eArtistInfo", title: app.data["artistDetails"], className: "col-xs-12 col-md-12",
              validators: {
                callback: {
                  message: app.data["artistDetailsValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            {
              id: "eArtSurfaceEnhance", title: app.data["enhance"], className: "col-xs-12 col-md-12",
              validators: {
                callback: {
                  message: app.data["enhanceValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            {
              id: "eArtLocalCharacter", title: app.data["adhere"], className: "col-xs-12 col-md-12",
              validators: {
                callback: {
                  message: app.data["adhereValidation"],
                  callback: function (value, validator, $field) {
                    return ((value == "") ? false : true);
                  }
                }
              }
            },
            { id: "eAdditionalComments", title: app.data["comments"], className: "col-xs-12 col-md-12" },
          ]
        }]
    },
    {
      id: "attSec",
      title: app.data["Attachments Section"],
      className: "panel-info",
      rows: [
        {
          fields: [
            { id: "AttachmentText", title: "", type: "html", html: app.data["AttachmentText"], className: "col-xs-12 col-md-12" },
            {
              id: "Images", "prehelptext": app.data["ImagesText"], title: app.data["Images"], type: "html", "aria-label": "Dropzone File Upload Control Field for Images",
              html: '<section aria-label="File Upload Control Field for Images" id="attachment"><div class="dropzone" id="image_dropzone" aria-label="Dropzone File Upload Control for Images Section"></div></section><input type="hidden" name="txtPicName" id="txtPicName" value="" /><section id="image_uploads"></section>', className: "col-xs-12 col-md-12"
            },
            {
              id: "Documents", "prehelptext": app.data["DocumentsText"], title: app.data["Documents"], type: "html", "aria-label": "Dropzone File Upload Control Field for Documents",
              html: '<section aria-label="File Upload Control Field for Documents" id="attachment"><div class="dropzone" id="document_dropzone" aria-label="Dropzone File Upload Control for Document Section"></div></section><section id="doc_uploads"></section>', className: "col-xs-12 col-md-12"
            },
            { id: "DeclarationText", title: "", type: "html", html: app.data["DeclarationText"], className: "col-xs-12 col-md-12" },
            { id: "submitHelp", title: "", type: "html", html: app.data["SubmitText"], className: "col-xs-12 col-md-12" },
            {
              id: "actionBar",
              type: "html",
              html: `<div className="col-xs-12 col-md-12"><button class="btn btn-success" id="savebtn"><span class="glyphicon glyphicon-send" aria-hidden="true"></span> ` + config.button.submitReport + `</button>
                 <button class="btn btn-success" id="printbtn"><span class="glyphicon glyphicon-print" aria-hidden="true"></span>Print</button></div>`
            },
            { id: "successFailRow", type: "html", className: "col-xs-12 col-md-12", html: `<div id="successFailArea" className="col-xs-12 col-md-12"></div>` },
            { id: "fid", type: "html", html: "<input type=\"text\" id=\"fid\" aria-label=\"Document ID\" aria-hidden=\"true\" name=\"fid\">", class: "hidden" },
            { id: "action", type: "html", html: "<input type=\"text\" id=\"action\" aria-label=\"Action\" aria-hidden=\"true\" name=\"action\">", class: "hidden" },
            { id: "createdBy", type: "html", html: "<input type=\"text\" id=\"createdBy\" aria-label=\"Complaint Created By\" aria-hidden=\"true\" name=\"createdBy\">", class: "hidden" },
            { id: "recCreated", type: "html", html: "<input type=\"text\" id=\"recCreated\" aria-label=\"Record Creation Date\" aria-hidden=\"true\" name=\"recCreated\">", class: "hidden" },
            { id: "AddressGeoID", type: "html", html: "<input type=\"hidden\" aria-label=\"Address Geo ID\" aria-hidden=\"true\" id=\"AddressGeoID\" name=\"AddressGeoID\">", class: "hidden" },
            { id: "AddressLongitude", type: "html", html: "<input type=\"hidden\" aria-label=\"Address Longitude\" aria-hidden=\"true\" id=\"AddressLongitude\" name=\"AddressLongitude\">", class: "hidden" },
            { id: "AddressLatitude", type: "html", html: "<input type=\"hidden\" aria-label=\"Address Latitude\" aria-hidden=\"true\" id=\"AddressLatitude\" name=\"AddressLatitude\">", class: "hidden" },
            { id: "MapAddress", type: "html", html: "<input type=\"hidden\" aria-label=\"Map Address\" aria-hidden=\"true\" id=\"MapAddress\" name=\"MapAddress\">", class: "hidden" },
            { id: "ShowMap", type: "html", html: "<input type=\"hidden\" aria-label=\"Show Map\" aria-hidden=\"true\" id=\"ShowMap\" name=\"ShowMap\">", class: "hidden" },
            { id: "lsteStatus", type: "html", html: "<input type=\"hidden\" aria-label=\"Status\" aria-hidden=\"true\" value=\"New\" id=\"lsteStatus\" name=\"lsteStatus\">", class: "hidden" }

          ]
        }
      ]
    }
  ]
  return section;
}
function getAdminSectionsBottom() {
  let section = [
    {
      id: "hiddenSec",
      title: "",
      className: "panel-info",
      rows: [{ fields: [] }]
    }]
  return section;
}
function setGeoParams() {
  // Sets the GEO parameters based on the address/city/postal code value
  let queryStr = "?searchString=" + encodeURIComponent($("#emAddress").val() + " " + $("#emCity").val() + " " + $("#emPostalCode").val());
  $.ajax({
    url: config.geoURL + queryStr + config.geoParam,
    type: "GET",
    cache: "true",
    dataType: "json",
    async: false,
    success: function (data) {
      let resultLoc = data.result.bestResult;
      if (resultLoc.length > 0) {
        $("#AddressGeoID").val(resultLoc[0]["geoId"]);
        $("#AddressLongitude").val(resultLoc[0]["longitude"]);
        $("#AddressLatitude").val(resultLoc[0]["latitude"]);
      } else {
        $("#AddressGeoID").val("");
        $("#AddressLongitude").val("");
        $("#AddressLatitude").val("");
      }
    },
    error: function () {
      $("#AddressGeoID").val("");
      $("#AddressLongitude").val("");
      $("#AddressLatitude").val("");
    }
  })
}
function checkFileUploads(uploads) {
  let queryString = "";
  let binLoc = "";

  if (uploads.length > 0) {
    $.each(uploads, function (index, item) {
      if (binLoc == "") {
        binLoc = item.bin_id;
      } else {
        binLoc = binLoc + "," + item.bin_id;
      }
    })
  }

  if (binLoc != "") { queryString = "&keepFiles=" + binLoc };

  return queryString;
}
function makePDF() {
  var docDefinition = { content: 'This is an sample PDF printed with pdfMake' };
  // open the PDF in a new window
  var docDefinition = {
    content: [{ text: "Date Created" + " : " + $("#recCreated").val(), style: 'header2' },
    { text: "    " },
    { text: "    " },
    { text: app.data["Form Title"], style: 'header1' },
    { text: "    " },
    { text: app.data["Contact Details Section"], style: 'header2' },
    { text: app.data["First Name"] + " : " + $("#eFirstName").val(), style: 'paragraph' },
    { text: app.data["Last Name"] + " : " + $("#eLastName").val(), style: 'paragraph' },
    { text: app.data["Address"] + " : " + $("#eAddress").val(), style: 'paragraph' },
    { text: app.data["City"] + " : " + $("#eCity").val(), style: 'paragraph' },
    { text: app.data["Postal Code"] + " : " + $("#ePostalCode").val(), style: 'paragraph' },
    { text: app.data["Phone"] + " : " + $("#ePrimaryPhone").val() },
    { text: app.data["Fax"] + " : " + $("#eFax").val() },
    { text: app.data["Email"] + " : " + $("#eEmail").val() },
    { text: "    " },
    { text: app.data["Contact Details Section"], style: 'header2' },
    { text: app.data["Address"] + " : " + $("#emAddress").val() },
    { text: app.data["City"] + " : " + $("#emCity").val() },
    { text: app.data["Postal Code"] + " : " + $("#emPostalCode").val() },
    { text: app.data["Phone"] + " : " + $("#emPrimaryPhone").val() },
    { text: app.data["Facing Street"] + " : " + $("#emFacingStreet").val() },
    { text: app.data["graffitiDesLocation"] + " : " + $("#emDescriptiveLocation").val() },
    { text: "    " },
    { text: app.data["Details Section"], style: 'header2' },
    { text: app.data["permission"] + " : " + ($("#ePermission").val() == undefined ? "" : $("#ePermission").val()) },
    { text: app.data["notice"] + " : " + $("#eNotice").val() },
    { text: app.data["compliance"] + " : " + $("#ComplianceDate").val() },
    { text: app.data["maintenance"] + " : " + $("#eMaintenance").val() },
    { text: app.data["agreementDetails"] + " : " + $("#eMaintenanceAgreement").val() },
    { text: app.data["artistDetails"] + " : " + $("#eArtistInfo").val() },
    { text: app.data["enhance"] + " : " + $("#eArtSurfaceEnhance").val() },
    { text: app.data["adhere"] + " : " + $("#eArtLocalCharacter").val() },
    { text: "    " },
    { text: app.data["comments"] + " : " + $("#eAdditionalComments").val() },
    { text: "    " },
    { text: app.data["Attachments Section"], style: 'header2' },
    { text: app.data["Images"] + " : " + processUploads(imageDropzone, repo, false) },
    { text: app.data["Documents"] + " : " + processUploads(docDropzone, repo, false) },

      /*  // if you don't need styles, you can use a simple string to define a paragraph
       'This is a standard paragraph, using default style',
   
       // using a { text: '...' } object lets you set styling properties
       { text: 'This paragraph will have a bigger font', fontSize: 15 },
   
       // if you set pass an array instead of a string, you'll be able
       // to style any fragment individually
       {
         text: [
           'This paragraph is defined as an array of elements to make it possible to ',
           { text: 'restyle part of it and make it bigger ', fontSize: 15 },
           'than the rest.'
         ]
       }*/
    ],
    styles: {
      header1: {
        fontSize: 14,
        bold: true
      },
      header2: {
        fontSize: 13,
        bold: true
      },
      paragraph: {
        fontSize: 12,
      }
    }

  };
  //pdfMake.createPdf(docDefinition).open();

  // print the PDF
  pdfMake.createPdf(docDefinition).print();

  // download the PDF
  // pdfMake.createPdf(docDefinition).download('request.pdf');
}
CotForm.prototype.getData = function () {
  var data = {}, blanks = {}, rowIndexMap = {}; // {stringIndex: intIndex}
  $.each($('#' + this.cotForm.id).serializeArray(), function (i, o) {
    if (o.name.indexOf('row[') !== -1) {
      var sRowIndex = o.name.substring(o.name.indexOf('[') + 1, o.name.indexOf(']'));
      if (sRowIndex !== 'template') {
        var rows = data['rows'] || [];
        var iRowIndex = rowIndexMap[sRowIndex];
        if (iRowIndex === undefined) {
          rows.push({});
          iRowIndex = rows.length - 1;
          rowIndexMap[sRowIndex] = iRowIndex;
        }
        rows[iRowIndex][o.name.split('.')[1]] = o.value;
        data['rows'] = rows;
      }
    } else {
      if (data.hasOwnProperty(o.name)) {
        data[o.name] = $.makeArray(data[o.name]);
        data[o.name].push(o.value);
      } else {
        data[o.name] = o.value;
      }
    }
  });

  var _blanks = $('#' + this.cotForm.id + ' [name]')
  $.each(_blanks, function () {
    if (!data.hasOwnProperty(this.name)) {
      blanks[this.name] = '';
    }
  });
  return $.extend(data, blanks);
};


